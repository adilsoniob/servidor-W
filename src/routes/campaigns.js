import { Router } from "express";
import { campaignManager, EMOJI_POOL } from "../services/campaign.js";

export function createCampaignRouter(authMiddleware) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const campaigns = await campaignManager.listCampaigns();
      res.json({ success: true, campaigns });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/emojis", (req, res) => {
    res.json({ success: true, emojis: EMOJI_POOL });
  });

  router.get("/:id", async (req, res) => {
    try {
      const campaign = await campaignManager.getCampaign(parseInt(req.params.id, 10));
      if (!campaign) return res.status(404).json({ success: false, error: "Campanha nao encontrada" });
      res.json({ success: true, campaign });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/:id/stats", async (req, res) => {
    try {
      const stats = await campaignManager.getStats(parseInt(req.params.id, 10));
      if (!stats) return res.status(404).json({ success: false, error: "Campanha nao encontrada" });
      res.json({ success: true, stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/:id/sends", async (req, res) => {
    try {
      const status = req.query.status || "all";
      const limit = parseInt(req.query.limit, 10) || 100;
      const sends = await campaignManager.getCampaignSends(parseInt(req.params.id, 10), status, limit);
      res.json({ success: true, sends });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const { name, messages, numbers, delayMin, delayMax } = req.body || {};
      const campaign = await campaignManager.createCampaign({ name, messages, numbers, delayMin, delayMax });
      res.json({ success: true, campaign });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post("/preview", async (req, res) => {
    try {
      const { template, variables } = req.body || {};
      const preview = await campaignManager.renderPreview(template || "", variables || {});
      res.json({ success: true, preview });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post("/:id/start", async (req, res) => {
    try {
      const whatsapp = req.app.locals.whatsapp;
      const campaign = await campaignManager.startCampaign(parseInt(req.params.id, 10), whatsapp);
      res.json({ success: true, campaign });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post("/:id/pause", async (req, res) => {
    try {
      const campaign = await campaignManager.pauseCampaign(parseInt(req.params.id, 10));
      res.json({ success: true, campaign });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post("/:id/cancel", async (req, res) => {
    try {
      const campaign = await campaignManager.cancelCampaign(parseInt(req.params.id, 10));
      res.json({ success: true, campaign });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await campaignManager.cancelCampaign(parseInt(req.params.id, 10));
      res.json({ success: true, message: "Campanha cancelada e removida" });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
