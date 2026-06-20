import express from "express";
import cors from "cors";

import { authMiddleware } from "./middleware/auth.js";
import { trackerMiddleware } from "./middleware/tracker.js";
import { healthRouter } from "./routes/health.js";
import { statusRouter } from "./routes/status.js";
import { sendMessageRouter } from "./routes/send-message.js";
import { reconnectRouter } from "./routes/reconnect.js";
import { disconnectRouter } from "./routes/disconnect.js";
import { qrPageRouter } from "./routes/qr-page.js";
import { createAdminRouter } from "./routes/admin.js";
import { createQueueRouter } from "./routes/queue.js";
import { createCampaignRouter } from "./routes/campaigns.js";
import { createDiagnosticsRouter } from "./routes/diagnostics.js";

export function createApp(whatsapp) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.locals.whatsapp = whatsapp;

  const tracker = trackerMiddleware(whatsapp);

  // Admin + monitoring API
  app.use("/", createAdminRouter(whatsapp));

  // Public routes
  app.use("/", qrPageRouter);
  app.use("/health", healthRouter);
  app.use("/api/whatsapp/status", statusRouter);

  // Autenticated routes (com tracker)
  app.use("/api/send-message", authMiddleware, tracker, sendMessageRouter);
  app.use("/api/whatsapp/reconnect", authMiddleware, tracker, reconnectRouter);
  app.use("/api/whatsapp/disconnect", authMiddleware, tracker, disconnectRouter);

  // Queue management API
  app.use("/api/queue", createQueueRouter(authMiddleware, tracker));

  // Campaign management API
  app.use("/api/campaigns", createCampaignRouter(authMiddleware));

  // Diagnostics (autenticada)
  app.use("/api/diag", createDiagnosticsRouter(authMiddleware));

  // Multi-account routes (autenticadas)
  app.post("/api/account/:index/connect", authMiddleware, tracker, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.connectAccount(index);
    res.json({ success: true, message: `Solicitação de conexão enviada para conta ${index}.` });
  });

  app.post("/api/account/:index/reconnect", authMiddleware, tracker, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.reconnectAccount(index);
    res.json({ success: true, message: `Solicitação de reconexão enviada para conta ${index}.` });
  });

  app.post("/api/account/:index/disconnect", authMiddleware, tracker, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.disconnectAccount(index);
    res.json({ success: true, message: `Solicitação de desconexão enviada para conta ${index}.` });
  });

  app.post("/api/account/:index/remove", authMiddleware, tracker, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.removeAccount(index);
    res.json({ success: true, message: `Sessão da conta ${index} removida.` });
  });

  app.get("/api/accounts", (req, res) => {
    const accounts = whatsapp.getAccounts();
    res.json({ success: true, accounts });
  });

  app.get("/api/admin/stats", (req, res) => {
    const stats = whatsapp.storage?.getMessageStats() || {};
    res.json({ success: true, stats });
  });

  // ---- New admin API endpoints ----

  app.get("/api/admin/dashboard", (req, res) => {
    const accounts = whatsapp.getAccounts() || [];
    const msgStats = whatsapp.storage?.getMessageStatsByPeriod() || {};
    const integrationStats = whatsapp.storage?.getIntegrationStats() || {};
    const msgTotal = whatsapp.storage?.getMessageStats() || {};

    const connected = accounts.filter((a) => a.state === "connected").length;
    const offline = accounts.filter((a) => a.state !== "connected").length;

    res.json({
      success: true,
      accounts: { total: accounts.length, connected, offline },
      messages: {
        allTime: msgTotal,
        periods: msgStats,
      },
      integrations: integrationStats,
    });
  });

  app.get("/api/admin/integrations", (req, res) => {
    const integrations = whatsapp.storage?.getIntegrations() || [];
    res.json({ success: true, integrations });
  });

  app.post("/api/admin/account/add", authMiddleware, tracker, (req, res) => {
    const accounts = whatsapp.getAccounts();
    const freeSlot = accounts.findIndex((a) => a.state === "offline" || a.state === "starting" || a.state === "error");
    if (freeSlot === -1) {
      return res.status(400).json({ success: false, error: "Todas as contas já estão em uso." });
    }
    whatsapp.connectAccount(freeSlot);
    res.json({ success: true, index: freeSlot, message: `Nova conta criada no slot ${freeSlot + 1}.` });
  });

  app.post("/api/admin/qr/refresh/:index", authMiddleware, tracker, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.reconnectAccount(index);
    res.json({ success: true, message: `QR Code renovado para conta ${index}.` });
  });

  app.post("/api/admin/qr/cancel/:index", authMiddleware, tracker, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.disconnectAccount(index);
    res.json({ success: true, message: `Conexão cancelada para conta ${index}.` });
  });

  // 404 + error handler
  app.use((_req, res) => res.status(404).json({ success: false, error: "Rota não encontrada." }));
  app.use((err, _req, res, _next) => {
    console.error("[express-error]", err);
    res.status(500).json({ success: false, error: "Erro interno do servidor." });
  });

  return app;
}
