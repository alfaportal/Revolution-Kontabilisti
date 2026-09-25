const fs = require("fs");
const path = require("path");
const { SCANS_DIR, SCAN_TYPE_DIRS } = require("./data-paths");
const { normalizeScanType } = require("./ai-scan-prompts");

function scanTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function folderForType(scanType) {
  const t = normalizeScanType(scanType);
  return SCAN_TYPE_DIRS[t] || "other";
}

function extForMime(mimeType) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function ensureScanDirs() {
  fs.mkdirSync(SCANS_DIR, { recursive: true });
  for (const sub of Object.values(SCAN_TYPE_DIRS)) {
    fs.mkdirSync(path.join(SCANS_DIR, sub), { recursive: true });
  }
}

/**
 * Ruan foto + JSON rezultati në scans/{type}/scan_YYYY-MM-DD_HHMMSS.*
 */
function saveScanArtifact(scanType, imageBase64, mimeType, resultData) {
  ensureScanDirs();
  const ts = scanTimestamp();
  const base = `scan_${ts}`;
  const sub = folderForType(scanType);
  const dir = path.join(SCANS_DIR, sub);
  const ext = extForMime(mimeType);
  const imagePath = path.join(dir, `${base}${ext}`);
  const jsonPath = path.join(dir, `${base}.json`);

  fs.writeFileSync(imagePath, Buffer.from(imageBase64, "base64"));
  fs.writeFileSync(jsonPath, JSON.stringify({
    scan_type: normalizeScanType(scanType),
    scanned_at: new Date().toISOString(),
    mime_type: mimeType,
    image_file: path.basename(imagePath),
    data: resultData,
  }, null, 2), "utf8");

  return { imagePath, jsonPath, base };
}

function countScans() {
  if (!fs.existsSync(SCANS_DIR)) return 0;
  let n = 0;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json") && name.startsWith("scan_")) n++;
    }
  };
  walk(SCANS_DIR);
  return n;
}

module.exports = {
  saveScanArtifact,
  countScans,
  ensureScanDirs,
  scanTimestamp,
  folderForType,
};
