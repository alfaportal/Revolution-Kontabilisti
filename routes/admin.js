const express = require("express");
const path = require("path");
const { requireAdmin } = require("../middleware/admin-auth");
const { requireBridgeAdmin } = require("../middleware/admin-bridge-auth");
const { registerClientWithLicense } = require("../services/admin-register");
const db = require("../services/supabase");
const { planDefaults } = require("../services/supabase-plans");

const router = express.Router();

/** Bridge telefon — regjistrim klienti + licencë (device_id = Hardware ID desktop) */
router.post("/clients/register-license", requireBridgeAdmin, async (req, res) => {
  try {
    const data = await registerClientWithLicense(req.body || {});
    res.status(data.already_exists ? 200 : 201).json({
      ok: true,
      ...data,
      already_exists: !!data.already_exists,
      message: data.already_exists ? "Tashmë ekziston" : "Licenca u regjistrua",
    });
  } catch (e) {
    res.status(400).json({ ok: false, status: "error", message: e.message });
  }
});

/** Listë licencash për bridge (telefon) */
router.get("/clients", requireBridgeAdmin, async (_req, res) => {
  try {
    const rows = await db.listAllLicenses();
    const clients = rows.map((l) => ({
      id: l.id,
      emri: l.business_name || "—",
      email: "",
      telefoni: l.phone || "",
      status: l.status === "active" ? "aktiv" : "joaktiv",
      device_id: l.device_id,
      hardware_id: l.device_id,
      license_id: l.id,
      product_line: "kontabilisti",
    }));
    res.json({ ok: true, clients, licenses: rows, product_line: "kontabilisti" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get("/licenses", requireBridgeAdmin, async (_req, res) => {
  try {
    const rows = await db.listAllLicenses();
    res.json({
      licenses: rows.map((l) => ({
        id: l.id,
        client_id: l.id,
        client_name: l.business_name || "—",
        device_id: l.device_id,
        hardware_id: l.device_id,
        license_key: l.license_key || l.id,
        celesi: l.license_key || l.id,
        statusi: l.status === "active" ? "aktive" : l.status || "skaduar",
        status: l.status,
        data_skadimit: String(l.expires_at || "").slice(0, 10),
        expires_at: String(l.expires_at || "").slice(0, 10),
        last_check_at: l.last_check_at,
        product_line: "kontabilisti",
        app_type: "kontabilisti",
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
