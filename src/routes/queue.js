import { Router } from "express";
import { log } from "../logger.js";
import * as queue from "../services/queue.js";

export function createQueueRouter(authMiddleware, trackerMiddleware) {
  const router = Router();

  router.post("/enqueue", authMiddleware, trackerMiddleware, async (req, res) => {
    try {
      const { phone, message, metadata } = req.body || {};
      if (!phone || !message) {
        return res.status(400).json({ success: false, error: "phone e message são obrigatórios." });
      }
      const cleanNumber = String(phone).replace(/\D+/g, "");
      if (cleanNumber.length < 10) {
        return res.status(400).json({ success: false, error: `Número inválido (${cleanNumber.length} dígitos).` });
      }
      const id = await queue.enqueue(cleanNumber, String(message).trim(), { source: "api", ...(metadata || {}) });
      const qStats = await queue.stats();
      log.info("[queue-api] Mensagem enfileirada", { id, phone: cleanNumber.slice(-8), pending: qStats.pending });
      res.status(202).json({ success: true, queueId: id, message: "Mensagem enfileirada para envio.", stats: qStats });
    } catch (err) {
      log.error("[queue-api] Erro ao enfileirar", { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/stats", async (req, res) => {
    try {
      const qStats = await queue.stats();
      res.json({ success: true, stats: qStats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/messages", async (req, res) => {
    try {
      const status = req.query.status || "all";
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const offset = parseInt(req.query.offset, 10) || 0;
      const messages = (await queue.list(status, limit, offset)).map((m) => ({
        ...m,
        phone: String(m.phone || "").slice(0, 4) + "****" + String(m.phone || "").slice(-4),
      }));
      res.json({ success: true, messages, count: messages.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/retry/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, error: "ID inválido." });
      await queue.retry(id);
      res.json({ success: true, message: "Mensagem reenfileirada." });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/retry-all", async (req, res) => {
    try {
      const count = await queue.retryAll();
      res.json({ success: true, message: `${count} mensagens reenfileiradas.` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/clear-completed", async (req, res) => {
    try {
      const count = await queue.clearCompleted();
      res.json({ success: true, message: `${count} mensagens completadas removidas.` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
