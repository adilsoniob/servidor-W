import { Router } from "express";

export function createAdminRouter(whatsapp) {
  const router = Router();
  const storage = whatsapp.storage;

  // ---- Status ----

  router.get("/api/admin/status", (_req, res) => {
    const primary = whatsapp.getStatus();
    res.json({ ...primary, accounts: whatsapp.getAccounts() });
  });

  // ---- Messages ----

  router.get("/api/admin/messages", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const filters = {};
    if (req.query.account !== undefined) filters.account = parseInt(req.query.account, 10);
    if (req.query.status) filters.status = req.query.status;
    if (req.query.phone) filters.phone = req.query.phone;
    if (req.query.dateFrom) filters.dateFrom = req.query.dateFrom;
    if (req.query.dateTo) filters.dateTo = req.query.dateTo;
    const messages = storage?.getMessages(limit, filters) || [];
    res.json({ success: true, messages, total: messages.length, filters });
  });

  router.get("/api/admin/messages/:phone", (req, res) => {
    const phone = req.params.phone;
    const messages = storage?.getMessagesByPhone(phone) || [];
    res.json({ success: true, messages });
  });

  // ---- Contacts ----

  router.get("/api/admin/contacts", (_req, res) => {
    const contacts = storage?.getContacts() || [];
    res.json({ success: true, contacts });
  });

  // ---- Logs ----

  router.get("/api/admin/logs", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const filters = {};
    if (req.query.account !== undefined) filters.account = parseInt(req.query.account, 10);
    if (req.query.event) filters.event = req.query.event;
    if (req.query.dateFrom) filters.dateFrom = req.query.dateFrom;
    if (req.query.dateTo) filters.dateTo = req.query.dateTo;
    const logs = storage?.getLogs(limit, filters) || [];
    res.json({ success: true, logs, total: logs.length, filters });
  });

  // ---- Stats ----

  router.get("/api/admin/stats", (_req, res) => {
    const stats = storage?.getMessageStats() || {};
    res.json({ success: true, stats });
  });

  // ---- Admin HTML ----

  router.get("/admin", (_req, res) => {
    res.type("html").send(ADMIN_HTML);
  });

  return router;
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Painel WhatsApp | Vale Sa�de</title>
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<style>
:root {
  --bg-body: #0b1120;
  --bg-card: #151f35;
  --bg-sidebar: #111b2e;
  --border: #1e2d4a;
  --text: #e2e8f0;
  --text-muted: #7e8ea8;
  --accent: #3b82f6;
  --accent-glow: rgba(59,130,246,0.15);
  --green: #22c55e;
  --green-bg: rgba(34,197,94,0.1);
  --yellow: #eab308;
  --yellow-bg: rgba(234,179,8,0.1);
  --red: #ef4444;
  --red-bg: rgba(239,68,68,0.1);
  --radius: 12px;
  --radius-sm: 8px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family: 'Inter', system-ui, -apple-system, sans-serif;background:var(--bg-body);color:var(--text);min-height:100vh;line-height:1.5}
.layout{display:grid;grid-template-columns:260px 1fr;min-height:100vh}

/* Sidebar */
.sidebar{background:var(--bg-sidebar);padding:1.5rem;border-right:1px solid var(--border);overflow-y:auto;position:sticky;top:0;height:100vh}
.sidebar-logo{font-size:1.1rem;font-weight:700;letter-spacing:-.02em;margin-bottom:1.75rem;display:flex;align-items:center;gap:.5rem}
.sidebar-logo span{background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sidebar h2{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:1.5rem 0 .75rem;font-weight:600}
.sidebar h2:first-of-type{margin-top:0}
.sidebar .stat{display:flex;justify-content:space-between;align-items:center;padding:.45rem 0;font-size:.8rem}
.sidebar .stat + .stat{border-top:1px solid var(--border)}
.sidebar .stat-label{color:var(--text-muted)}
.sidebar .stat-value{font-weight:600;font-variant-numeric:tabular-nums}
.sidebar-accounts{display:flex;flex-direction:column;gap:2px}
.sidebar-account{display:flex;align-items:center;gap:.4rem;padding:.35rem .5rem;border-radius:6px;font-size:.78rem;color:var(--text-muted)}
.sidebar-account .dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.sidebar-account .name{flex:1}
.sidebar-account .val{font-weight:500;font-size:.72rem}
.sidebar-actions{display:flex;flex-direction:column;gap:.35rem;margin-top:.5rem}

/* Main top bar */
.main{display:flex;flex-direction:column;height:100vh}
.topbar{display:flex;align-items:center;gap:.75rem;padding:.85rem 1.5rem;background:var(--bg-card);border-bottom:1px solid var(--border);flex-shrink:0}
.topbar h1{font-size:.95rem;font-weight:600}
.topbar .sub{font-size:.75rem;color:var(--text-muted);margin-left:auto}
.status-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;transition:all .3s}
.status-dot--connected{background:var(--green);box-shadow:0 0 12px rgba(34,197,94,.4)}
.status-dot--awaiting_qr,.status-dot--reconnecting{background:var(--yellow);box-shadow:0 0 12px rgba(234,179,8,.4)}
.status-dot--offline,.status-dot--auth_failure,.status-dot--error{background:var(--red);box-shadow:0 0 12px rgba(239,68,68,.4)}
.status-dot--starting{background:var(--text-muted)}

/* Content area */
.content{flex:1;overflow-y:auto;padding:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;align-content:start}

/* Cards */
.card{background:var(--bg-card);border-radius:var(--radius);padding:1.25rem;border:1px solid var(--border);transition:border-color .2s}
.card:hover{border-color:#2a3d60}
.card h3{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:1rem;font-weight:600}
.card-full{grid-column:1/-1}

/* Accounts grid */
.accounts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:.85rem}
.account-card{background:var(--bg-body);border-radius:var(--radius);padding:1rem;border:1px solid var(--border);transition:all .2s}
.account-card:hover{border-color:var(--accent);box-shadow:0 0 20px var(--accent-glow)}
.account-card .ac-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem}
.account-card .ac-label{font-weight:600;font-size:.85rem}

/* Status tags */
.tag{display:inline-block;padding:.15rem .55rem;border-radius:999px;font-size:.68rem;font-weight:600}
.tag-success{background:var(--green-bg);color:var(--green)}
.tag-warning{background:var(--yellow-bg);color:var(--yellow)}
.tag-error{background:var(--red-bg);color:var(--red)}
.tag-info{background:rgba(96,165,250,0.1);color:#60a5fa}

.account-card .ac-info{font-size:.75rem;color:var(--text-muted);line-height:1.6}
.account-card .ac-qr{text-align:center;padding:10px 0}
.account-card .ac-qr img{width:160px;height:160px;border-radius:var(--radius-sm);border:1px solid var(--border);background:#fff;padding:6px;transition:transform .2s}
.account-card .ac-qr img:hover{transform:scale(1.05)}
.account-card .ac-qr p{font-size:.65rem;color:var(--text-muted);margin-top:4px}
.account-card .ac-actions{display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.65rem}

/* Profile */
.profile-row{display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem}
.profile-info strong{font-size:.85rem}
.profile-info small{display:block;color:var(--text-muted);font-size:.75rem;margin-top:1px}
.error-text{color:var(--red);font-size:.75rem}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;padding:.4rem .9rem;border-radius:var(--radius-sm);border:none;font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s}
.btn:hover{transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{box-shadow:0 4px 14px rgba(59,130,246,.35)}
.btn-danger{background:var(--red);color:#fff}
.btn-danger:hover{box-shadow:0 4px 14px rgba(239,68,68,.35)}
.btn-warning{background:var(--yellow);color:#0f172a}
.btn-warning:hover{box-shadow:0 4px 14px rgba(234,179,8,.35)}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text-muted)}
.btn-outline:hover{border-color:var(--text);color:var(--text)}
.btn-sm{padding:.3rem .6rem;font-size:.7rem}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none !important}

/* Table */
.table-wrap{max-height:420px;overflow-y:auto;border-radius:var(--radius-sm);border:1px solid var(--border)}
table{width:100%;border-collapse:collapse;font-size:.78rem}
th{text-align:left;padding:.55rem .6rem;color:var(--text-muted);font-weight:600;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;background:var(--bg-body);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:1}
td{padding:.5rem .6rem;border-bottom:1px solid rgba(30,45,74,.5);font-size:.78rem;transition:background .15s}
tr:hover td{background:rgba(59,130,246,.04)}

/* Tabs */
.tabs{display:flex;gap:0;margin-bottom:1rem;border-bottom:1px solid var(--border)}
.tab{padding:.55rem 1.1rem;font-size:.78rem;font-weight:600;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;transition:all .2s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab-content{display:none;animation:fadeUp .25s ease}
.tab-content.active{display:block}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* Filters */
.filters{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.85rem;align-items:center}
.filters input,.filters select{padding:.35rem .55rem;border-radius:6px;border:1px solid var(--border);background:var(--bg-body);color:var(--text);font-size:.75rem;outline:none;transition:border-color .2s}
.filters input:focus,.filters select:focus{border-color:var(--accent)}
.filters label{font-size:.73rem;color:var(--text-muted);display:inline-flex;align-items:center;gap:.35rem}
.msg-count{font-size:.7rem;color:var(--text-muted);margin-left:auto}

/* Contacts */
.contact-item{display:flex;justify-content:space-between;align-items:center;padding:.45rem .6rem;border-bottom:1px solid rgba(30,45,74,.5);font-size:.78rem;transition:background .15s}
.contact-item:hover{background:rgba(59,130,246,.04)}
.contact-item:last-child{border-bottom:none}
.contact-phone{font-weight:600;font-family:'JetBrains Mono',monospace;font-size:.82rem}
.contact-meta{text-align:right;color:var(--text-muted);font-size:.7rem}

/* Logs */
.log-item{padding:.4rem .6rem;border-bottom:1px solid rgba(30,45,74,.5);font-size:.73rem;display:flex;gap:.6rem;transition:background .15s}
.log-item:hover{background:rgba(59,130,246,.04)}
.log-item:last-child{border-bottom:none}
.log-time{color:var(--text-muted);flex-shrink:0;font-family:'JetBrains Mono',monospace;font-size:.68rem;min-width:140px}
.log-ac{font-weight:600;flex-shrink:0;min-width:80px;color:var(--accent)}
.log-event{font-weight:600;flex-shrink:0;min-width:100px}
.log-desc{color:var(--text-muted)}
.empty{color:var(--text-muted);font-size:.78rem;padding:1.5rem 0;text-align:center}

/* Toast */
.toast{position:fixed;bottom:1.5rem;right:1.5rem;z-index:999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none}
.toast-item{padding:.65rem 1rem;border-radius:var(--radius-sm);font-size:.78rem;font-weight:500;pointer-events:auto;animation:slideIn .25s ease;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.toast-success{background:#065f46;color:#a7f3d0;border:1px solid #059669}
.toast-error{background:#7f1d1d;color:#fecaca;border:1px solid #dc2626}
.toast-info{background:#1e3a5f;color:#bfdbfe;border:1px solid #2563eb}
@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}

@media(max-width:768px){
  .layout{grid-template-columns:1fr}
  .sidebar{display:none}
  .content{grid-template-columns:1fr;padding:1rem}
  .accounts-grid{grid-template-columns:1fr}
  .filters{flex-direction:column;align-items:stretch}
  .msg-count{margin-left:0}
  .log-time{min-width:auto}
}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>WhatsApp Server</span></div>

    <h2>Visão Geral</h2>
    <div class="stat"><span class="stat-label">Total Contas</span><span class="stat-value" id="sTotalAcc">0</span></div>
    <div class="stat"><span class="stat-label">Conectadas</span><span class="stat-value" id="sConnectedAcc">0</span></div>
    <div class="stat"><span class="stat-label">Mensagens</span><span class="stat-value" id="sMsgCount">0</span></div>
    <div class="stat"><span class="stat-label">Contatos</span><span class="stat-value" id="sContactCount">0</span></div>

    <h2>Contas</h2>
    <div class="sidebar-accounts" id="sidebarAccounts"></div>

    <h2>Ações</h2>
    <div class="sidebar-actions">
      <button class="btn btn-primary btn-sm" onclick="connectAll()">Conectar Todas</button>
      <button class="btn btn-outline btn-sm" onclick="fetchStatus()">Atualizar Status</button>
    </div>
  </aside>

  <div class="main">
    <div class="topbar">
      <span class="status-dot status-dot--starting" id="topStatusDot"></span>
      <h1 id="topStatusText">Inicializando...</h1>
      <span class="sub" id="topUptime"></span>
    </div>

    <div class="content">
      <div class="card card-full">
        <h3>Contas</h3>
        <div class="accounts-grid" id="accountsGrid"></div>
      </div>

      <div class="card card-full">
        <div class="tabs">
          <div class="tab active" data-tab="messages">Mensagens</div>
          <div class="tab" data-tab="contacts">Contatos</div>
          <div class="tab" data-tab="logs">Logs</div>
        </div>

        <div class="tab-content active" id="tabMessages">
          <div class="filters">
            <label>Conta: <select id="filterMsgAccount"><option value="">Todas</option></select></label>
            <label>Status: <select id="filterMsgStatus"><option value="">Todos</option><option value="sent">Enviado</option><option value="delivered">Entregue</option><option value="received">Recebida</option><option value="read">Lida</option><option value="failed">Falhou</option></select></label>
            <label>Número: <input id="filterMsgPhone" placeholder="559999999999" style="width:120px"></label>
            <button class="btn btn-primary btn-sm" onclick="loadMessages()">Filtrar</button>
            <span class="msg-count" id="msgCount"></span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Data/Hora</th><th>Número</th><th>Conta</th><th>Status</th><th>Origem</th></tr></thead>
              <tbody id="messagesBody"><tr><td colspan="5" class="empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </div>

        <div class="tab-content" id="tabContacts">
          <div id="contactsBody"></div>
        </div>

        <div class="tab-content" id="tabLogs">
          <div class="filters">
            <label>Conta: <select id="filterLogAccount"><option value="">Todas</option></select></label>
            <label>Evento: <input id="filterLogEvent" placeholder="evento" style="width:120px"></label>
            <button class="btn btn-primary btn-sm" onclick="loadLogs()">Filtrar</button>
            <span class="msg-count" id="logCount"></span>
          </div>
          <div class="table-wrap">
            <div id="logsBody"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toastContainer"></div>

<script>
const socket = io({ transports: ["websocket", "polling"], reconnection: true });

// ---- Toast ----
function toast(msg, type) {
  const el = document.createElement("div");
  el.className = "toast-item toast-" + type;
  el.textContent = msg;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 3500);
}

// ---- Helpers ----
function statusDot(state) {
  return 'status-dot--' + (state || 'starting');
}
function statusLabel(state) {
  const m = { connected: "Conectado", awaiting_qr: "Aguardando QR", reconnecting: "Reconectando", starting: "Iniciando", offline: "Desconectado", auth_failure: "Falha Auth", error: "Erro" };
  return m[state] || state;
}
function statusTag(state) {
  const m = { connected: "success", awaiting_qr: "warning", reconnecting: "warning", starting: "info", offline: "error", auth_failure: "error", error: "error" };
  return 'tag-' + (m[state] || 'info');
}
function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString("pt-BR") : '---'; }

// ---- Render Accounts ----
function renderAccounts(accounts) {
  var grid = document.getElementById("accountsGrid");
  if (!accounts || !accounts.length) {
    grid.innerHTML = '<div class="empty">Nenhuma conta configurada.</div>';
    return;
  }

  var connected = accounts.filter(function(a) { return a.state === "connected"; }).length;
  document.getElementById("sTotalAcc").textContent = accounts.length;
  document.getElementById("sConnectedAcc").textContent = connected;

  // Sidebar
  var sb = document.getElementById("sidebarAccounts");
  sb.innerHTML = accounts.map(function(a) {
    return '<div class="sidebar-account"><span class="dot ' + statusDot(a.state) + '"></span><span class="name">' + a.label + '</span><span class="val">' + statusLabel(a.state) + '</span></div>';
  }).join("");

  grid.innerHTML = accounts.map(function(a, i) {
    var qrHtml = (a.qr && a.state === "awaiting_qr")
      ? '<div class="ac-qr"><img src="' + a.qr + '" alt="QR Code"><p>Escaneie com seu WhatsApp</p></div>'
      : '';

    var profileHtml = a.profileName
      ? '<div class="profile-row"><div class="profile-info"><strong>' + esc(a.profileName) + '</strong><small>' + (a.profileNumber ? '+55 ' + a.profileNumber : '') + '</small></div></div>'
      : '';

    var infoHtml = '';
    if (a.connectedAt) infoHtml += '<div>Conectado: ' + fmtDate(a.connectedAt) + '</div>';
    if (a.disconnectedAt) infoHtml += '<div>Desconectado: ' + fmtDate(a.disconnectedAt) + '</div>';
    if (a.lastSendAt) infoHtml += '<div>Último envio: ' + fmtDate(a.lastSendAt) + '</div>';
    if (a.reconnectAttempts) infoHtml += '<div>Tentativas: ' + a.reconnectAttempts + '</div>';
    if (a.lastError) infoHtml += '<div class="error-text">Erro: ' + esc(a.lastError.error || '') + '</div>';

    return '<div class="account-card">' +
      '<div class="ac-header">' +
        '<span class="ac-label">' + a.label + '</span>' +
        '<span class="tag ' + statusTag(a.state) + '">' + statusLabel(a.state) + '</span>' +
      '</div>' +
      profileHtml +
      '<div class="ac-info">' + infoHtml + '</div>' +
      qrHtml +
      '<div class="ac-actions">' +
        '<button class="btn btn-primary btn-sm" onclick="acConnect(' + i + ')">Conectar</button>' +
        '<button class="btn btn-warning btn-sm" onclick="acReconnect(' + i + ')">Reconectar</button>' +
        '<button class="btn btn-danger btn-sm" onclick="if(confirm(\'Desconectar ' + a.label + '?\'))acDisconnect(' + i + ')">Desconectar</button>' +
        '<button class="btn btn-outline btn-sm" onclick="if(confirm(\'Remover sessão ' + a.label + '? Isso exige novo QR Code.\'))acRemove(' + i + ')">Remover</button>' +
      '</div>' +
    '</div>';
  }).join("");
}

// ---- Messages ----
async function loadMessages() {
  var params = new URLSearchParams();
  var acc = document.getElementById("filterMsgAccount").value;
  var status = document.getElementById("filterMsgStatus").value;
  var phone = document.getElementById("filterMsgPhone").value.trim();
  if (acc) params.set("account", acc);
  if (status) params.set("status", status);
  if (phone) params.set("phone", phone);
  params.set("limit", "100");
  try {
    var r = await fetch("/api/admin/messages?" + params.toString());
    var data = await r.json();
    var tbody = document.getElementById("messagesBody");
    document.getElementById("msgCount").textContent = data.total + " msg";
    if (!data.messages || !data.messages.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">Nenhuma mensagem.</td></tr>';
      return;
    }
    tbody.innerHTML = data.messages.map(function(m) {
      var sc = (m.status === "sent" || m.status === "received" || m.status === "delivered") ? "success" : m.status === "failed" ? "error" : "warning";
      var sl = { sent: "Enviado", received: "Recebida", delivered: "Entregue", read: "Lida", failed: "Falhou" };
      var ac = "WhatsApp " + String((m.account !== undefined ? m.account : 0) + 1).padStart(2, "0");
      return '<tr><td>' + fmtDate(m.timestamp) + '</td><td>+55 ' + m.to + '</td><td>' + ac + '</td><td><span class="tag tag-' + sc + '">' + (sl[m.status] || m.status) + '</span></td><td>' + (m.source || "api") + '</td></tr>';
    }).join("");
    document.getElementById("sMsgCount").textContent = data.total || data.messages.length;
  } catch(e) {}
}

// ---- Contacts ----
async function loadContacts() {
  try {
    var r = await fetch("/api/admin/contacts");
    var data = await r.json();
    var el = document.getElementById("contactsBody");
    if (!data.contacts || !data.contacts.length) {
      el.innerHTML = '<div class="empty">Nenhum contato.</div>';
      return;
    }
    el.innerHTML = data.contacts.map(function(c) {
      var sc = (c.lastStatus === "sent" || c.lastStatus === "received" || c.lastStatus === "delivered") ? "success" : c.lastStatus === "failed" ? "error" : "warning";
      var sl = { sent: "Enviado", received: "Recebida", delivered: "Entregue", read: "Lida", failed: "Falhou" };
      var ac = "WhatsApp " + String((c.account !== undefined ? c.account : 0) + 1).padStart(2, "0");
      return '<div class="contact-item"><div><div class="contact-phone">+55 ' + (c.phone || "---") + '</div><div style="color:var(--text-muted);font-size:.7rem">' + ac + ' | ' + fmtDate(c.lastSendAt) + '</div></div><div class="contact-meta"><span class="tag tag-' + sc + '">' + (sl[c.lastStatus] || c.lastStatus) + '</span><div style="margin-top:4px">' + (c.count || 0) + ' msg</div></div></div>';
    }).join("");
    document.getElementById("sContactCount").textContent = data.contacts.length;
  } catch(e) {}
}

// ---- Logs ----
async function loadLogs() {
  var params = new URLSearchParams();
  var acc = document.getElementById("filterLogAccount").value;
  var event = document.getElementById("filterLogEvent").value.trim();
  if (acc) params.set("account", acc);
  if (event) params.set("event", event);
  params.set("limit", "200");
  try {
    var r = await fetch("/api/admin/logs?" + params.toString());
    var data = await r.json();
    var el = document.getElementById("logsBody");
    document.getElementById("logCount").textContent = data.total + " logs";
    if (!data.logs || !data.logs.length) {
      el.innerHTML = '<div class="empty">Nenhum log.</div>';
      return;
    }
    el.innerHTML = data.logs.map(function(l) {
      var ac = l.data && l.data.account !== undefined ? l.data.account : 0;
      var acName = "WApp " + (ac + 1);
      return '<div class="log-item"><span class="log-time">' + fmtDate(l.timestamp) + '</span><span class="log-ac">' + acName + '</span><span class="log-event">' + esc(l.event || "") + '</span><span class="log-desc">' + esc(l.description || "") + '</span></div>';
    }).join("");
  } catch(e) {}
}

// ---- Account Actions ----
async function acConnect(i) {
  var btn = event && event.target ? event.target : null;
  if (btn) { btn.disabled = true; btn.textContent = "..."; }
  try {
    var r = await fetch("/api/account/" + i + "/connect", { method: "POST", headers: { Authorization: "Bearer " + (window._apiKey || "") } });
    var d = await r.json();
    toast(d.message || "Conectando...", "info");
    setTimeout(fetchStatus, 1000);
  } catch(e) { toast("Erro ao conectar", "error"); }
  if (btn) setTimeout(function() { btn.disabled = false; btn.textContent = "Conectar"; }, 2000);
}
async function acReconnect(i) {
  var btn = event && event.target ? event.target : null;
  if (btn) { btn.disabled = true; btn.textContent = "..."; }
  try {
    var r = await fetch("/api/account/" + i + "/reconnect", { method: "POST", headers: { Authorization: "Bearer " + (window._apiKey || "") } });
    var d = await r.json();
    toast(d.message || "Reconectando...", "info");
    setTimeout(fetchStatus, 1000);
  } catch(e) { toast("Erro ao reconectar", "error"); }
  if (btn) setTimeout(function() { btn.disabled = false; btn.textContent = "Reconectar"; }, 2000);
}
async function acDisconnect(i) {
  try {
    var r = await fetch("/api/account/" + i + "/disconnect", { method: "POST", headers: { Authorization: "Bearer " + (window._apiKey || "") } });
    var d = await r.json();
    toast(d.message || "Desconectando...", "info");
    setTimeout(fetchStatus, 1000);
  } catch(e) { toast("Erro ao desconectar", "error"); }
}
async function acRemove(i) {
  try {
    var r = await fetch("/api/account/" + i + "/remove", { method: "POST", headers: { Authorization: "Bearer " + (window._apiKey || "") } });
    var d = await r.json();
    toast(d.message || "Sessão removida", "info");
    setTimeout(fetchStatus, 1000);
  } catch(e) { toast("Erro ao remover sessão", "error"); }
}
async function connectAll() {
  toast("Conectando todas as contas...", "info");
  for (var i = 0; i < 5; i++) {
    try { await fetch("/api/account/" + i + "/connect", { method: "POST", headers: { Authorization: "Bearer " + (window._apiKey || "") } }); } catch(e) {}
  }
  setTimeout(fetchStatus, 1000);
}

// ---- Status ----
async function fetchStatus() {
  try {
    var r = await fetch("/api/admin/status");
    var data = await r.json();
    window._lastStatus = data;

    var dot = document.getElementById("topStatusDot");
    var text = document.getElementById("topStatusText");
    var state = data.state || "starting";
    dot.className = "status-dot " + statusDot(state);
    text.textContent = data.message || data.state || "---";

    if (data.accounts) {
      renderAccounts(data.accounts);
      var sel1 = document.getElementById("filterMsgAccount");
      var sel2 = document.getElementById("filterLogAccount");
      var cur1 = sel1.value;
      var cur2 = sel2.value;
      sel1.innerHTML = '<option value="">Todas</option>' + data.accounts.map(function(a,i) { return '<option value="' + i + '">' + a.label + '</option>'; }).join("");
      sel2.innerHTML = '<option value="">Todas</option>' + data.accounts.map(function(a,i) { return '<option value="' + i + '">' + a.label + '</option>'; }).join("");
      sel1.value = cur1;
      sel2.value = cur2;
    }
  } catch(e) {}
}

// ---- Tabs ----
document.querySelectorAll(".tab").forEach(function(tab) {
  tab.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-content").forEach(function(t) { t.classList.remove("active"); });
    tab.classList.add("active");
    var id = tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
    document.getElementById("tab" + id).classList.add("active");
    if (id === "Messages") loadMessages();
    if (id === "Contacts") loadContacts();
    if (id === "Logs") loadLogs();
  });
});

// ---- Socket.io ----
socket.on("admin:status", fetchStatus);
socket.on("admin:message", function() { loadMessages(); loadContacts(); });
socket.on("connect", fetchStatus);
socket.on("connected", fetchStatus);
socket.on("disconnected", fetchStatus);
socket.on("qr", fetchStatus);

// ---- Init ----
fetchStatus();
loadMessages();
loadContacts();
loadLogs();
setInterval(fetchStatus, 4000);
setInterval(loadMessages, 7000);
setInterval(loadContacts, 12000);
setInterval(loadLogs, 18000);
</script>
</body>
</html>`;
