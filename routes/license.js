const express = require("express");
const { isValidDeviceId } = require("../services/device");
const db = require("../services/supabase");

const router = express.Router();

function mapCheckToHardwareCodes(result) {
  if (result.valid) {
    return { valid: true, code: "OK", message: "Licenca është aktive.", ...result };
  }
  const st = String(result.status || "").toLowerCase();
  if (st === "not_found") {
    return {
      valid: false,
      code: "NOT_FOUND",
      message: result.message || "Licenca nuk është regjistruar për këtë Hardware ID.",
    };
  }
  if (st === "suspended") {
    return { valid: false, code: "SUSPENDED", message: result.message || "Licenca nuk është aktive." };
  }
  if (st === "expired") {
    return { valid: false, code: "EXPIRED", message: result.message || "Licenca ka skaduar." };
  }
  return {
    valid: false,
    code: "REVOKED",
    message: result.message || "Licenca nuk është aktive.",
  };
}

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

router.post("/check-hardware", async (req, res) => {
  try {
    const body = req.body || {};
    const device_id = body.device_id || body.hardware_id;
    if (!device_id || !isValidDeviceId(device_id)) {
      return res.status(400).json({
        valid: false,
        code: "NOT_FOUND",
        message: "Hardware ID i pavlefshëm.",
      });
    }
    const result = mapCheckToHardwareCodes(await db.checkByDevice(device_id));
    const status = result.valid ? 200 : result.code === "NOT_FOUND" ? 404 : 403;
    res.status(status).json(result);
  } catch (e) {
    res.status(500).json({ valid: false, code: "ERROR", message: e.message });
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
