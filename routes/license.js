const express = require("express");
const { isValidDeviceId } = require("../services/device");
const db = require("../services/supabase");

const router = express.Router();

router.post("/check", async (req, res) => {
  try {
    const { device_id } = req.body || {};
    if (!device_id || !isValidDeviceId(device_id)) {
      return res.status(400).json({ valid: false, status: "error", message: "device_id i pavlefshëm" });
    }
    const result = await db.checkByDevice(device_id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ valid: false, status: "error", message: e.message });
  }
});

router.post("/activate", async (req, res) => {
  try {
    const { device_id, license_key, email } = req.body || {};
    if (!device_id || !isValidDeviceId(device_id)) {
      return res.status(400).json({ valid: false, status: "error", message: "device_id i pavlefshëm" });
    }
    const key = String(license_key || "").trim();
    if (!key) {
      return res.status(400).json({ valid: false, status: "error", message: "Mungon çelësi i licencës" });
    }
    const result = await db.activateByDevice(device_id, key, email);
    if (!result.valid) {
      return res.status(result.status === "not_found" ? 404 : 403).json(result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ valid: false, status: "error", message: e.message });
  }
});

module.exports = router;
