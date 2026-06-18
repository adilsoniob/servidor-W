import express from "express";
import cors from "cors";

import { authMiddleware } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { statusRouter } from "./routes/status.js";
import { sendMessageRouter } from "./routes/send-message.js";
import { reconnectRouter } from "./routes/reconnect.js";
import { disconnectRouter } from "./routes/disconnect.js";
import { qrPageRouter } from "./routes/qr-page.js";
import { createAdminRouter } from "./routes/admin.js";

export function createApp(whatsapp) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.locals.whatsapp = whatsapp;

  // Admin + monitoring API
  app.use("/", createAdminRouter(whatsapp));

  // Public routes
  app.use("/", qrPageRouter);
  app.use("/health", healthRouter);
  app.use("/api/whatsapp/status", statusRouter);

  // Autenticated routes
  app.use("/api/send-message", authMiddleware, sendMessageRouter);
  app.use("/api/whatsapp/reconnect", authMiddleware, reconnectRouter);
  app.use("/api/whatsapp/disconnect", authMiddleware, disconnectRouter);

  // Multi-account routes (autenticadas)
  app.post("/api/account/:index/connect", authMiddleware, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.connectAccount(index);
    res.json({ success: true, message: `Solicitação de conexão enviada para conta ${index}.` });
  });

  app.post("/api/account/:index/reconnect", authMiddleware, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.reconnectAccount(index);
    res.json({ success: true, message: `Solicitação de reconexão enviada para conta ${index}.` });
  });

  app.post("/api/account/:index/disconnect", authMiddleware, (req, res) => {
    const index = parseInt(req.params.index, 10);
    whatsapp.disconnectAccount(index);
    res.json({ success: true, message: `Solicitação de desconexão enviada para conta ${index}.` });
  });

  app.post("/api/account/:index/remove", authMiddleware, (req, res) => {
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

  // 404 + error handler
  app.use((_req, res) => res.status(404).json({ success: false, error: "Rota não encontrada." }));
  app.use((err, _req, res, _next) => {
    console.error("[express-error]", err);
    res.status(500).json({ success: false, error: "Erro interno do servidor." });
  });

  return app;
}
