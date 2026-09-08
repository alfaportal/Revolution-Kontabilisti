const express = require("express");
const { config } = require("../config");
const { assertRuntimeConfig } = require("../config");
const { table } = require("../services/supabase");

function createHealthRouter() {
  const router = express.Router();
  router.get("/health", (_req, res) => {
    const missing = assertRuntimeConfig();
    res.json({
      ok: true,
      service: "revolution-kontabilisti-server",
      version: "1.0.0",
      env: config.nodeEnv,
      ready: missing.length === 0,
      missing_config: missing.length ? missing : undefined,
      supabase: !!(config.supabase.url && config.supabase.serviceKey),
      anthropic: !!config.anthropic.apiKey,
    });
  });
  return router;
}

function createAdminRouter() {
  const router = express.Router();

  router.post("/v1/admin/license/create", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!config.adminSecret || secret !== config.adminSecret) {
      return res.status(403).json({ ok: false, error: "Forbidden", code: "forbidden" });
    }
    const {
      license_key,
      business_name,
      nui,
      scans_limit = 500,
      expires_at,
      notes,
    } = req.body || {};
    if (!license_key) {
      return res.status(400).json({ ok: false, error: "license_key obligativ" });
    }
    try {
      const { data, error } = await table()
        .insert({
          license_key: String(license_key).trim().toUpperCase(),
          business_name: business_name || null,
          nui: nui ? String(nui).replace(/\D/g, "") : null,
          scans_limit: Number(scans_limit) || 500,
          expires_at: expires_at || null,
          notes: notes || null,
          active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      res.json({ ok: true, license: data });
    } catch (e) {
      console.error("[admin] create license:", e.message);
      res.status(400).json({ ok: false, error: e.message, code: "create_failed" });
    }
  });

  router.post("/v1/admin/license/deactivate", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!config.adminSecret || secret !== config.adminSecret) {
      return res.status(403).json({ ok: false, error: "Forbidden", code: "forbidden" });
    }
    const { license_key } = req.body || {};
    if (!license_key) {
      return res.status(400).json({ ok: false, error: "license_key obligativ" });
    }
    try {
      const { error } = await table()
        .update({ active: false, device_id: null })
        .eq("license_key", String(license_key).trim().toUpperCase());
      if (error) throw error;
      res.json({ ok: true, message: "Licenca u çaktivizua" });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  return router;
}

module.exports = { createHealthRouter, createAdminRouter };
