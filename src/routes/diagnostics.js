import { Router } from "express";
import { log } from "../logger.js";
import * as queue from "../services/queue.js";

export function createDiagnosticsRouter(authMiddleware) {
  const router = Router();

  router.get("/queue-test", authMiddleware, async (req, res) => {
    const results = [];
    const now = Date.now();

    try {
      const id = await queue.enqueue("5511999999999", "Teste de diagnostico " + now, { source: "diagnostic", ts: now });
      results.push({ step: "enqueue", ok: true, queueId: id });

      const items = await queue.dequeue(1);
      results.push({ step: "dequeue", ok: true, count: items.length });

      if (items.length > 0) {
        await queue.fail(items[0].id, "test error diagnostic");
        results.push({ step: "fail", ok: true, id: items[0].id });

        await queue.retry(items[0].id);
        results.push({ step: "retry", ok: true, id: items[0].id });

        const items2 = await queue.dequeue(1);
        if (items2.length > 0) {
          await queue.complete(items2[0].id);
          results.push({ step: "complete", ok: true, id: items2[0].id });
        }
      }

      const qStats = await queue.stats();
      results.push({ step: "stats", ok: true, stats: qStats });
    } catch (err) {
      results.push({ step: "error", ok: false, error: err.message });
    }

    const allOk = results.every((r) => r.ok);
    res.json({
      success: allOk,
      timestamp: new Date().toISOString(),
      results,
      summary: allOk ? "Todos os testes da fila passaram." : "Alguns testes falharam.",
    });
  });

  router.get("/log-test", authMiddleware, (req, res) => {
    const levels = ["info", "warn", "error"];
    for (const level of levels) {
      log[level]("[diagnostics] Teste de log " + level, { test: true, timestamp: Date.now() });
    }
    res.json({ success: true, message: "Logs de teste gerados em todos os niveis." });
  });

  return router;
}
