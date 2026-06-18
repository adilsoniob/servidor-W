/**
 * Envia uma mensagem. Rota protegida por authMiddleware.
 */

import { Router } from "express";

export const sendMessageRouter = Router();

const STATUS_BY_CODE = {
  NOT_REGISTERED: 404,
  BAD_NUMBER: 400,
  EMPTY_MESSAGE: 400,
  MISSING_PARAMS: 400,
  NOT_READY: 503,
  NOT_INITIALIZED: 503,
  SEND_TIMEOUT: 504,
};

sendMessageRouter.post("/", async (req, res) => {
  const { number, message } = req.body || {};

  if (!number || !message) {
    return res.status(400).json({
      success: false,
      code: "MISSING_PARAMS",
      error: "Parâmetros 'number' e 'message' são obrigatórios.",
    });
  }

  const whatsapp = req.app.locals.whatsapp;
  if (!whatsapp) {
    return res.status(503).json({
      success: false,
      code: "NOT_INITIALIZED",
      error: "Servidor WhatsApp não inicializado.",
    });
  }

  try {
    const result = await whatsapp.sendMessage(number, message);
    if (result.success) {
      return res.json(result);
    }
    const status = STATUS_BY_CODE[result.code] || 502;
    return res.status(status).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      code: "INTERNAL_EXCEPTION",
      error: err.message || "Erro interno inesperado.",
    });
  }
});
