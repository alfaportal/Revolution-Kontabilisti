const db = require("../services/supabase");
const { isValidDeviceId } = require("../services/device");

async function requireValidLicense(req, res, next) {
  const { license_key, device_id } = req.body || {};
  if (!license_key) {
    return res.status(400).json({ status: "error", code: "MISSING_LICENSE", message: "Mungon license_key" });
  }
  if (device_id && !isValidDeviceId(device_id)) {
    return res.status(400).json({ status: "error", code: "INVALID_DEVICE", message: "device_id i pavlefshëm" });
  }
  const check = await db.checkLicenseRecord(license_key, device_id);
  if (!check.valid) {
    const code = check.status === "scans_exhausted" ? "SCANS_EXHAUSTED" : "LICENSE_INVALID";
    return res.status(403).json({
      status: "error",
      code,
      message: check.message || "Licenca nuk është aktive",
    });
  }
  req.licenseCheck = check;
  req.licenseKey = license_key;
  next();
}

module.exports = { requireValidLicense };
