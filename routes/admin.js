const express = require("express");
const path = require("path");
const { requireAdmin } = require("../middleware/admin-auth");
const db = require("../services/supabase");
const { planDefaults } = require("../services/supabase-plans");

const router = express.Router();

router.get("/licenses", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.listAllLicenses();
    res.json({
      licenses: rows.map((l) => ({
        device_id: l.device_id,
        business_name: l.business_name,
        owner_name: l.owner_name,
        phone: l.phone,
        nui: l.nui,
        status: l.status,
        plan: l.plan,
        scans_used: l.scans_used || 0,
        scans_limit: l.scans_limit || 500,
        created_at: String(l.created_at || "").slice(0, 10),
        expires_at: String(l.expires_at || "").slice(0, 10),
      })),
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

router.get("/dashboard", requireAdmin, async (_req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

router.post("/license/create", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.device_id) return res.status(400).json({ status: "error", message: "device_id obligativ" });
    const plan = b.plan || "standard";
    const defs = planDefaults(plan);
    const lic = await db.createLicense({
      ...b,
      scans_limit: b.scans_limit || defs.scans_limit,
      duration_months: b.duration_months || defs.months,
    });
    res.json({
      status: "created",
      license_key: lic.license_key || lic.id,
      device_id: lic.device_id,
      expires_at: String(lic.expires_at || "").slice(0, 10),
    });
  } catch (e) {
    res.status(400).json({ status: "error", message: e.message });
  }
});

router.post("/license/update", requireAdmin, async (req, res) => {
  try {
    const { device_id, action, value } = req.body || {};
    if (!device_id || !action) {
      return res.status(400).json({ status: "error", message: "device_id dhe action obligative" });
    }
    const result = await db.updateLicenseByDevice(device_id, action, value);
    if (!result.ok) return res.status(404).json({ status: "error", message: result.error });
    res.json({ status: "ok", license: result.license });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

module.exports = router;
