const db = require("../services/supabase");
const { isValidDeviceId } = require("../services/device");

async function requireActiveLicense(req, res, next) {
  const deviceId = req.body?.device_id;
  if (!deviceId || !isValidDeviceId(deviceId)) {
    return res.status(400).json({ status: "error", code: "INVALID_DEVICE", message: "device_id i pavlefshëm" });
  }
  const v = await db.validateForScan(deviceId);
  if (!v.ok) {
    return res.status(403).json({ status: "error", code: v.code, message: v.message });
  }
  req.licenseCheck = v.check;
  next();
}

module.exports = { requireActiveLicense };
