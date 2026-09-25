const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function isProtectionEnabled() {
  return process.env.KONTABILISTI_PROTECTED === "1" && process.env.DEV_MODE !== "true";
}

function checksumsPath(appRoot) {
  return path.join(appRoot, ".checksums.json");
}

function verifyIntegrity(appRoot) {
  if (!isProtectionEnabled()) return { ok: true, skipped: true };

  const manifestPath = checksumsPath(appRoot);
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: "Mungon manifesti i integritetit (.checksums.json)" };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, error: "Manifesti i integritetit është i dëmtuar" };
  }

  const files = manifest.files || {};
  for (const [rel, expected] of Object.entries(files)) {
    const full = path.join(appRoot, rel);
    if (!fs.existsSync(full)) {
      return { ok: false, error: `Skedari mungon: ${rel}`, file: rel };
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    if (actual !== expected) {
      return { ok: false, error: `Integriteti dështoi: ${rel}`, file: rel };
    }
  }
  return { ok: true };
}

module.exports = { verifyIntegrity, checksumsPath, isProtectionEnabled };
