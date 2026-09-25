const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  DB_PATH, DATA_DIR, INVOICES_DIR, EXPORTS_DIR, BACKUP_DIR_APPDATA,
} = require("./data-paths");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function runPowerShell(script) {
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", windowsHide: true }
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "PowerShell gabim").trim());
  }
  return (r.stdout || "").trim();
}

function exportFullZip(destZip) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const zipPath = destZip || path.join(EXPORTS_DIR, `kontabilisti_export_${Date.now()}.zip`);
  const staging = path.join(EXPORTS_DIR, `_staging_${Date.now()}`);
  fs.mkdirSync(staging, { recursive: true });

  try {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, path.join(staging, "kontabilisti.db"));
    }
    if (fs.existsSync(INVOICES_DIR)) {
      runPowerShell(
        `Copy-Item -Path '${INVOICES_DIR.replace(/'/g, "''")}' -Destination '${path.join(staging, "invoices").replace(/'/g, "''")}' -Recurse -Force`
      );
    }
    if (fs.existsSync(BACKUP_DIR_APPDATA)) {
      copyDirRecursive(BACKUP_DIR_APPDATA, path.join(staging, "backups"));
    }
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    runPowerShell(
      `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
    );
    return { ok: true, path: zipPath, size: fs.statSync(zipPath).size };
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function importFromZip(zipPath) {
  if (!fs.existsSync(zipPath)) throw new Error("Skedari ZIP nuk u gjet");
  const staging = path.join(EXPORTS_DIR, `_import_${Date.now()}`);
  fs.mkdirSync(staging, { recursive: true });

  try {
    runPowerShell(
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${staging.replace(/'/g, "''")}' -Force`
    );
    const dbSrc = path.join(staging, "kontabilisti.db");
    if (!fs.existsSync(dbSrc)) throw new Error("ZIP nuk përmban kontabilisti.db");

    const safety = path.join(DATA_DIR, `pre_import_${Date.now()}.db`);
    if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, safety);

    fs.copyFileSync(dbSrc, DB_PATH);

    const invSrc = path.join(staging, "invoices");
    if (fs.existsSync(invSrc)) {
      fs.mkdirSync(INVOICES_DIR, { recursive: true });
      runPowerShell(
        `Copy-Item -Path '${invSrc.replace(/'/g, "''")}\\*' -Destination '${INVOICES_DIR.replace(/'/g, "''")}' -Recurse -Force`
      );
    }

    return { ok: true, safety, imported: zipPath };
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function importFromDb(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error("Skedari .db nuk u gjet");
  const safety = path.join(DATA_DIR, `pre_import_${Date.now()}.db`);
  if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, safety);
  fs.copyFileSync(dbPath, DB_PATH);
  return { ok: true, safety, imported: dbPath };
}

module.exports = { exportFullZip, importFromZip, importFromDb };
