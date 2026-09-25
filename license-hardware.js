const crypto = require("crypto");
const { execSync } = require("child_process");
const os = require("os");

const DEVICE_SALT = "revolution-kontabilisti-hw-v1";

function wmicValue(wmicClass, property) {
  if (process.platform !== "win32") return "";
  try {
    const out = execSync(`wmic ${wmicClass} get ${property}`, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 8000,
    });
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.find((l) => l.toLowerCase() !== property.toLowerCase()) || "";
  } catch {
    return "";
  }
}

function hardwareSeed() {
  const mb = wmicValue("baseboard", "SerialNumber");
  const disk = wmicValue("diskdrive", "SerialNumber");
  const cpu = wmicValue("cpu", "ProcessorId");
  if (mb || disk || cpu) {
    return `WIN|${mb}|${disk}|${cpu}|${DEVICE_SALT}`;
  }
  return [
    os.hostname(),
    os.userInfo().username,
    os.platform(),
    os.arch(),
    DEVICE_SALT,
  ].join("|");
}

/** Alias — fingerprint hardware (format XXXX-XXXX-XXXX-XXXX) */
function getDeviceFingerprint() {
  return getDeviceId();
}

/** Fingerprint hardware — format XXXX-XXXX-XXXX-XXXX */
function getDeviceId() {
  const hash = crypto.createHmac("sha256", DEVICE_SALT)
    .update(hardwareSeed())
    .digest("hex")
    .toUpperCase();
  const parts = [hash.slice(0, 4), hash.slice(4, 8), hash.slice(8, 12), hash.slice(12, 16)];
  return parts.join("-");
}

module.exports = { getDeviceId, getDeviceFingerprint, hardwareSeed };
