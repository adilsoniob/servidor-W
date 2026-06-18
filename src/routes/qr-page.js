/**
 * Página HTML do QR Code (acessível em /).
 * Mostra o status em tempo real via polling + socket.
 */

import { Router } from "express";

export const qrPageRouter = Router();

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp | Vale Sa�de</title>
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<style>
:root {
  --bg: #0b1120;
  --card: #151f35;
  --border: #1e2d4a;
  --text: #e2e8f0;
  --muted: #7e8ea8;
  --green: #22c55e;
  --yellow: #eab308;
  --accent: #3b82f6;
}
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text)}
.qr-wrap{text-align:center;padding:2.5rem;max-width:400px;width:90%}
.logo{margin-bottom:1.5rem}
.logo svg{width:40px;height:40px}
h1{font-size:1.3rem;font-weight:600;letter-spacing:-.02em;margin-bottom:.35rem}
.sub{font-size:.85rem;color:var(--muted);margin-bottom:1.75rem}
.qr-box{background:var(--card);border-radius:16px;padding:1.25rem;border:1px solid var(--border);position:relative;min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center}
#qr{width:220px;height:220px;border-radius:12px;background:#fff;padding:8px;display:none;transition:opacity .4s}
.qr-placeholder{width:220px;height:220px;border-radius:12px;background:rgba(30,45,74,.5);display:flex;align-items:center;justify-content:center;border:2px dashed var(--border)}
.qr-placeholder svg{width:48px;height:48px;opacity:.3}
.status{margin-top:1.25rem;padding:.7rem 1rem;border-radius:10px;font-weight:500;font-size:.82rem;display:flex;align-items:center;justify-content:center;gap:.5rem;transition:all .3s}
.st-ok{background:rgba(34,197,94,0.1);color:var(--green);border:1px solid rgba(34,197,94,0.2)}
.st-await{background:rgba(234,179,8,0.1);color:var(--yellow);border:1px solid rgba(234,179,8,0.2)}
.st-off{background:rgba(126,142,168,0.1);color:var(--muted);border:1px solid rgba(126,142,168,0.15)}
.spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(126,142,168,.2);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.actions{margin-top:1.5rem;display:flex;gap:.5rem;justify-content:center}
.btn{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem 1rem;border-radius:8px;border:none;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s;text-decoration:none}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{box-shadow:0 4px 14px rgba(59,130,246,.35);transform:translateY(-1px)}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--muted)}
.btn-outline:hover{border-color:var(--text);color:var(--text)}
.footer{margin-top:2rem;font-size:.7rem;color:var(--muted)}
@media(max-width:480px){.qr-wrap{padding:1.5rem}#qr{width:180px;height:180px}.qr-placeholder{width:180px;height:180px}}
</style>
</head>
<body>
<div class="qr-wrap">
  <div class="logo">
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  </div>
  <h1>Conectar WhatsApp</h1>
  <p class="sub">Escaneie o QR Code com o WhatsApp do seu celular</p>

  <div class="qr-box">
    <img id="qr" src="" alt="QR Code">
    <div class="qr-placeholder" id="placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
      </svg>
    </div>

    <div id="st" class="status st-off">
      <span class="spin"></span> Inicializando servidor...
    </div>
  </div>

  <div class="actions">
    <a href="/admin" class="btn btn-outline">Painel Administrativo</a>
  </div>

  <div class="footer">WhatsApp Server &mdash; Vale Sa�de</div>
</div>

<script>
(function(){
  var st = document.getElementById("st");
  var qr = document.getElementById("qr");
  var placeholder = document.getElementById("placeholder");
  var lastQr = "";
  var pollId = null;

  function setAwait(msg) {
    qr.style.display = "";
    placeholder.style.display = "none";
    st.className = "status st-await";
    st.innerHTML = msg;
  }
  function setOk(msg) {
    qr.style.display = "none";
    placeholder.style.display = "flex";
    st.className = "status st-ok";
    st.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ' + msg;
  }
  function setOff(msg) {
    qr.style.display = "none";
    placeholder.style.display = "flex";
    st.className = "status st-off";
    st.innerHTML = '<span class="spin"></span> ' + msg;
  }

  function applyState(s) {
    if (s.status === "connected") return setOk("Conectado!");
    if (s.qr && s.qr !== lastQr) {
      lastQr = s.qr;
      qr.src = s.qr;
      return setAwait("QR Code gerado. Escaneie com seu WhatsApp.");
    }
    if (s.status === "starting" || s.status === "reconnecting") return setOff("Inicializando servidor...");
    if (s.status === "auth_failure") return setOff("Falha de autenticacao. Reconectando...");
    if (s.status === "offline") return setOff("Desconectado.");
    return setOff(s.message || "Aguardando...");
  }

  function poll() {
    fetch("/api/whatsapp/status", { cache: "no-store" })
      .then(function(r) { return r.json(); })
      .then(applyState)
      .catch(function() { return setOff("Aguardando servidor..."); })
      .finally(function() { pollId = setTimeout(poll, 2500); });
  }

  try {
    var sock = io({ transports: ["websocket","polling"], reconnection: true });
    sock.on("qr", function(d) {
      if (d.qrDataUrl && d.qrDataUrl !== lastQr) {
        lastQr = d.qrDataUrl;
        qr.src = d.qrDataUrl;
        setAwait("QR Code gerado. Escaneie com seu WhatsApp.");
      }
    });
    sock.on("connected", function() { return setOk("Conectado!"); });
    sock.on("disconnected", function() { return setOff("WhatsApp desconectado."); });
    sock.on("connect_error", function() { if (!pollId) poll(); });
  } catch(e) {}

  poll();
})();
</script>
</body>
</html>`;

qrPageRouter.get("/", (_req, res) => {
  res.type("html").send(HTML);
});
