import { config } from "../config.js";
import { log } from "../logger.js";
import { WhatsAppSession } from "./session.js";

const MAX_ACCOUNTS = 5;

export class WhatsAppService {
  constructor(io, storage) {
    this.io = io;
    this.storage = storage;
    this.accounts = [];

    for (let i = 0; i < MAX_ACCOUNTS; i++) {
      const session = new WhatsAppSession(i, io, storage, config);
      this.accounts.push(session);
    }
  }

  // -- Index helpers --

  _validIndex(index) {
    return typeof index === "number" && index >= 0 && index < MAX_ACCOUNTS;
  }

  getAccount(index) {
    return this._validIndex(index) ? this.accounts[index] : null;
  }

  getAccounts() {
    return this.accounts.map((a) => a.getStatus());
  }

  // -- Backward-compat: primary account (index 0) --

  isReady() {
    return this.accounts[0]?.isReady() ?? false;
  }

  getStatus() {
    return this.accounts[0]?.getStatus() ?? null;
  }

  async sendMessage(number, message) {
    for (const account of this.accounts) {
      if (account.isReady()) {
        return account.sendMessage(number, message);
      }
    }
    log.warn("Nenhuma conta WhatsApp disponível para envio");
    return { success: false, code: "NO_ACCOUNT_READY", error: "Nenhuma conta WhatsApp conectada e pronta." };
  }

  async reconnect() {
    return this.accounts[0]?.reconnect() ?? null;
  }

  async disconnect() {
    return this.accounts[0]?.disconnect() ?? null;
  }

  destroy() {
    for (const account of this.accounts) {
      account.destroy();
    }
  }

  // -- Multi-account operations --

  async connectAccount(index) {
    const account = this.getAccount(index);
    if (!account) return { success: false, code: "INVALID_INDEX", error: `Conta ${index} inválida.` };
    return account.initialize();
  }

  async reconnectAccount(index) {
    const account = this.getAccount(index);
    if (!account) return { success: false, code: "INVALID_INDEX", error: `Conta ${index} inválida.` };
    return account.reconnect();
  }

  async disconnectAccount(index) {
    const account = this.getAccount(index);
    if (!account) return { success: false, code: "INVALID_INDEX", error: `Conta ${index} inválida.` };
    return account.disconnect();
  }

  async removeAccount(index) {
    const account = this.getAccount(index);
    if (!account) return { success: false, code: "INVALID_INDEX", error: `Conta ${index} inválida.` };
    return account.removeSession();
  }

  initializeAll() {
    for (const account of this.accounts) {
      account.initialize().catch((err) =>
        log.error(`[${account.accountLabel}] Falha na inicialização automática`, { error: err.message })
      );
    }
  }
}
