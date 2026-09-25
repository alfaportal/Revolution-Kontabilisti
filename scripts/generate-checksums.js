/**
 * Gjeneron .checksums.json për integritetin e build-it.
 * Ekzekuto pas obfuscate.js (në dist-obfuscated ose root).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const targetArg = process.argv[2];
const ROOT = targetArg
  ? path.resolve(targetArg)
  : (fs.existsSync(path.join(__dirname, "..", "dist-obfuscated"))
    ? path.join(__dirname, "..", "dist-obfuscated")
    : path.join(__dirname, ".."));

const CRITICAL = [
  "main.js",
  "preload.js",
  "database.js",
  "db-driver.js",
  "vat-engine.js",
  "server.js",
  "factory-reset.js",
  "license-guard.js",
  "license-hardware.js",
  "license-proxy-client.js",
  "license-server-config.js",
  "protection/security-startup.js",
  "protection/device-lock.js",
  "protection/integrity-check.js",
  "protection/db-crypto.js",
  "protection/cloud-license.js",
  "protection/cloud-health.js",
  "protection/license-boot.js",
];

function main() {
  const files = {};
  for (const rel of CRITICAL) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      console.warn("  skip (mungon):", rel);
      continue;
    }
    files[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    console.log("  checksum:", rel);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const manifest = {
    version: pkg.version || "0.0.0",
    built_at: new Date().toISOString(),
    product: "revolution-kontabilisti",
    files,
  };

  const outPath = path.join(ROOT, ".checksums.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log("\n.checksums.json →", outPath, `(${Object.keys(files).length} skedarë)\n`);
}

main();
