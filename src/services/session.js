import pkg from "whatsapp-web.js";
import qrcode from "qrcode";
import { log } from "../logger.js";

const Client = pkg.Client || pkg.default?.Client;
const LocalAuth = pkg.LocalAuth || pkg.default?.LocalAuth;

const STATES = Object.freeze({
  STARTING: "starting",
  AWAITING_QR: "awaiting_qr",
  CONNECTED: "connected",
  OFFLINE: "offline",
  AUTH_FAILURE: "auth_failure",
  RECONNECTING: "reconnecting",
  ERROR: "error",
});

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--mute-audio",
];

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout após ${ms}ms`)), ms)
    ),
  ]);

export class WhatsAppSession {
  constructor(index, io, storage, config) {
    this.index = index;
    this.io = io;
    this.storage = storage;
    this.config = config;
    this.status = { state: STATES.STARTING, qr: null, message: "Inicializando..." };
    this.client = null;
    this.initializing = null;
    this.reconnectAttempts = 0;
    this.profileName = null;
    this.profileNumber = null;
    this.profilePic = null;
    this.connectedAt = null;
    this.disconnectedAt = null;
    this.lastSendAt = null;
    this.lastError = null;
    this._destroyed = false;
  }

  get accountLabel() {
    return `WhatsApp ${String(this.index + 1).padStart(2, "0")}`;
  }

  isReady() {
    return this.status.state === STATES.CONNECTED && this.client !== null;
  }

  getStatus() {
    return {
      index: this.index,
      label: this.accountLabel,
      state: this.status.state,
      qr: this.status.qr,
      message: this.status.message,
      profileName: this.profileName,
      profileNumber: this.profileNumber,
      profilePic: this.profilePic,
      connectedAt: this.connectedAt,
      disconnectedAt: this.disconnectedAt,
      lastSendAt: this.lastSendAt,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  emit(event, data) {
    this.io?.emit(event, { account: this.index, ...data });
  }

  async sendMessage(number, message) {
    if (!this.client) return this._fail("NOT_INITIALIZED", "Cliente não inicializado.");
    if (!this.isReady()) return this._fail("NOT_READY", "WhatsApp não está conectado.");

    const cleanNumber = String(number || "").replace(/\D+/g, "");
    if (cleanNumber.length < 10) {
      return this._fail("BAD_NUMBER", `Número inválido (${cleanNumber.length} dígitos).`, cleanNumber);
    }
    if (!message || !message.trim()) {
      return this._fail("EMPTY_MESSAGE", "Mensagem vazia.");
    }

    const chatId = `${cleanNumber}@c.us`;

    try {
      const registered = await withTimeout(
        this.client.getNumberId(cleanNumber),
        5000,
        "getNumberId"
      );
      if (registered === null) {
        this._addLog("warn", "Número não registrado no WhatsApp", { to: cleanNumber });
        return this._fail("NOT_REGISTERED", "Número não registrado no WhatsApp.", cleanNumber);
      }

      const sent = await withTimeout(
        this.client.sendMessage(chatId, message),
        this.config.sendTimeoutMs,
        "sendMessage"
      );

      this.lastSendAt = new Date().toISOString();
      const messageId = sent?.id?._serialized || sent?.id || null;
      log.info(`[${this.accountLabel}] Mensagem enviada`, { to: chatId, messageId });
      this.storage?.addMessage({ to: cleanNumber, status: "sent", source: "api", id: messageId, account: this.index });
      this._addLog("message_sent", `Mensagem enviada para ${cleanNumber}`, { to: cleanNumber, messageId });
      this.emit("admin:message", { to: cleanNumber, status: "sent", account: this.index });
      return { success: true, message: "Mensagem enviada com sucesso.", to: chatId, messageId };
    } catch (err) {
      this._addLog("message_error", `Erro ao enviar para ${cleanNumber}: ${err.message}`, { to: cleanNumber, error: err.message });
      return this._fail("SEND_ERROR", err.message || String(err), cleanNumber);
    }
  }

  async initialize() {
    if (this._destroyed) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      try {
        await this._destroyClientSafely();
        const client = this._createClient();
        this._attachHandlers(client);
        this.client = client;
        this._setStatus(STATES.STARTING, "Inicializando...");
        await client.initialize();
        log.info(`[${this.accountLabel}] Cliente WhatsApp inicializado`);
      } catch (err) {
        this._setStatus(STATES.ERROR, `Erro na inicialização: ${err.message}`);
        log.error(`[${this.accountLabel}] Falha na inicialização`, { error: err.message });
        this._scheduleAutoReconnect("init_error");
      } finally {
        this.initializing = null;
      }
    })();

    return this.initializing;
  }

  async reconnect() {
    log.info(`[${this.accountLabel}] Reconexão manual solicitada`);
    this.reconnectAttempts = 0;
    this._setStatus(STATES.RECONNECTING, "Reconectando...");
    this.initializing = null;
    return this.initialize();
  }

  async disconnect() {
    log.info(`[${this.accountLabel}] Desconexão manual solicitada`);
    await this._destroyClientSafely();
    this._setStatus(STATES.OFFLINE, "Desconectado manualmente.");
    this.emit("disconnected", { reason: "manual" });
  }

  async removeSession() {
    log.info(`[${this.accountLabel}] Removendo sessão`);
    this._destroyed = true;
    await this._destroyClientSafely(true);
    this._setStatus(STATES.OFFLINE, "Sessão removida.");
    this.profileName = null;
    this.profileNumber = null;
    this.profilePic = null;
    this.connectedAt = null;
    this.disconnectedAt = null;
  }

  destroy() {
    log.info(`[${this.accountLabel}] Destroy solicitado`);
    this._destroyed = true;
    this._destroyClientSafely().catch(() => {});
  }

  _createClient() {
    return new Client({
      authStrategy: new LocalAuth({ clientId: this.config.clientId + "-" + this.index }),
      puppeteer: { headless: true, args: PUPPETEER_ARGS },
    });
  }

  _attachHandlers(client) {
    client.on("qr", async (qr) => {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        this._setStatus(STATES.AWAITING_QR, "QR Code gerado. Escaneie com seu WhatsApp.", qrDataUrl);
        this.emit("qr", { qrDataUrl, account: this.index });
        log.info(`[${this.accountLabel}] QR Code gerado`);
      } catch (err) {
        this._setStatus(STATES.AWAITING_QR, "Erro ao gerar QR Code.");
        log.error(`[${this.accountLabel}] Falha ao gerar QR Code`, { error: err.message });
      }
    });

    client.on("ready", async () => {
      this.reconnectAttempts = 0;
      this.connectedAt = new Date().toISOString();
      this.disconnectedAt = null;
      this._setStatus(STATES.CONNECTED, "Conectado e pronto.", null);
      this.emit("connected");
      log.info(`[${this.accountLabel}] WhatsApp conectado e pronto`);
      this._addLog("connected", "WhatsApp conectado e pronto");

      try {
        const info = client.info;
        if (info) {
          this.profileName = info.pushname || info.name || null;
          this.profileNumber = info.wid?.user || info.me?.user || null;
          try {
            const picUrl = await client.getProfilePicUrl(info.wid._serialized);
            this.profilePic = picUrl || null;
          } catch {}
          this.storage?.saveSession({
            account: this.index,
            label: this.accountLabel,
            profileName: this.profileName,
            profileNumber: this.profileNumber,
            connectedAt: this.connectedAt,
          });
        }
      } catch {}
    });

    client.on("disconnected", (reason) => {
      this.disconnectedAt = new Date().toISOString();
      this._setStatus(STATES.OFFLINE, `Desconectado: ${reason}`);
      this.emit("disconnected", { reason, account: this.index });
      log.warn(`[${this.accountLabel}] WhatsApp desconectado`, { reason });
      this._addLog("disconnected", `WhatsApp desconectado: ${reason}`, { reason });
      if (reason !== "LOGOUT") {
        this._scheduleAutoReconnect("disconnected");
      }
    });

    client.on("auth_failure", (msg) => {
      this._setStatus(STATES.AUTH_FAILURE, `Falha de autenticação: ${msg}`);
      log.error(`[${this.accountLabel}] Falha de autenticação`, { message: msg });
      this._addLog("auth_failure", `Falha de autenticação: ${msg}`, { message: msg });
      this._scheduleAutoReconnect("auth_failure", 5000);
    });

    client.on("message_ack", (msg, ack) => {
      const statusMap = { 1: "sent", 2: "received", 3: "read" };
      const status = statusMap[ack] || "sent";
      const phone = msg.from?.replace("@c.us", "") || "";
      if (phone) {
        this.storage?.updateMessageStatus(phone, status, this.index);
        this.emit("admin:message", { to: phone, status, account: this.index });
      }
    });

    client.on("message_create", (msg) => {
      if (msg.fromMe && msg.to) {
        const phone = msg.to.replace("@c.us", "");
        this.storage?.addMessage({ to: phone, status: "sent", source: "app", id: msg.id?._serialized, account: this.index });
        this.emit("admin:message", { to: phone, status: "sent", account: this.index });
      }
    });
  }

  async _destroyClientSafely(removeAuthFolder) {
    if (!this.client) return;
    const old = this.client;
    this.client = null;
    try {
      if (typeof old.logout === "function") {
        await withTimeout(old.logout(), 3000, "logout").catch(() => {});
      }
    } catch {}
    try {
      await withTimeout(old.destroy(), 5000, "destroy").catch(() => {});
    } catch {}
    if (removeAuthFolder) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const authDir = path.join(process.cwd(), ".wwebjs_auth", `session-${this.config.clientId}-${this.index}`);
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
          log.info(`[${this.accountLabel}] Pasta de autenticação removida`);
        }
      } catch {}
    }
  }

  _scheduleAutoReconnect(reason, baseDelayMs) {
    if (this._destroyed) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      log.error(`[${this.accountLabel}] Limite de reconexão atingido`, { reason, attempts: this.reconnectAttempts });
      return;
    }
    this.reconnectAttempts += 1;
    const base = baseDelayMs ?? this.config.reconnectBaseDelayMs;
    const delay = base * Math.min(this.reconnectAttempts, 3);
    log.info(`[${this.accountLabel}] Reconexão automática agendada`, { reason, attempt: this.reconnectAttempts, delayMs: delay });
    setTimeout(() => {
      this.initialize().catch((err) =>
        log.error(`[${this.accountLabel}] Falha na reconexão automática`, { error: err.message })
      );
    }, delay);
  }

  _setStatus(state, message, qr = undefined) {
    const prevState = this.status.state;
    this.status = { state, qr: qr === undefined ? this.status.qr : qr, message };
    if (prevState !== state) {
      this._addLog("state_change", `Estado: ${prevState} -> ${state}`, { from: prevState, to: state, message });
      this.emit("admin:status", this.getStatus());
    }
  }

  _addLog(event, description, data = {}) {
    this.storage?.addLog(event, description, { ...data, account: this.index });
  }

  _fail(code, error, phone = null) {
    const entry = { at: new Date().toISOString(), code, error, phone };
    this.lastError = entry;
    log.warn(`[${this.accountLabel}] Falha no envio`, entry);
    return { success: false, code, error, phone };
  }
}
