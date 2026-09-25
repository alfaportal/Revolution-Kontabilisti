const fs = require("fs");
const path = require("path");
const { getPaths, ensureDirs } = require("./data-paths");

function copyFileSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDirRecursive(s, d);
    else copyFileSafe(s, d);
  }
}

function legacyLocations() {
  const p = getPaths();
  const candidates = [];

  try {
    candidates.push(path.join(__dirname, "kontabilisti.db"));
    candidates.push(path.join(__dirname, "data", "kontabilisti.db"));
  } catch { /* ignore */ }

  try {
    const execDir = path.dirname(process.execPath);
    candidates.push(path.join(execDir, "kontabilisti.db"));
    candidates.push(path.join(execDir, "resources", "kontabilisti.db"));
    candidates.push(path.join(execDir, "resources", "app.asar.unpacked", "kontabilisti.db"));
  } catch { /* ignore */ }

  try {
    const { app } = require("electron");
    const userData = app.getPath("userData");
    candidates.push(path.join(userData, "kontabilisti.db"));
    candidates.push(path.join(userData, "backups"));
    candidates.push(path.join(userData, "invoices"));
  } catch { /* ignore */ }

  const normTarget = path.normalize(p.DB_PATH).toLowerCase();
  return [...new Set(candidates.map((c) => path.normalize(c)))].filter((c) => {
    if (c.toLowerCase() === normTarget) return false;
    if (c.endsWith(`${path.sep}backups`) || c.endsWith(`${path.sep}invoices`)) {
      return fs.existsSync(c);
    }
    return c.endsWith(".db") && fs.existsSync(c);
  });
}

/**
 * Migron DB/foto/backup nga lokacionet e vjetra (brenda app folderit) te AppData.
 * @returns {{ migrated: boolean, from?: string, log: string[] }}
 */
function migrateLegacyData(logFn) {
  const out = { migrated: false, log: [] };
  const push = (m) => { out.log.push(m); if (logFn) logFn(m); };

  ensureDirs();
  const p = getPaths();
  const legacyDbs = legacyLocations().filter((c) => c.endsWith(".db"));

  for (const oldDb of legacyDbs) {
    const targetExists = fs.existsSync(p.DB_PATH);
    const oldStat = fs.statSync(oldDb);
    const newStat = targetExists ? fs.statSync(p.DB_PATH) : null;
    const shouldCopy = !targetExists || oldStat.mtimeMs > (newStat?.mtimeMs || 0) || oldStat.size > (newStat?.size || 0);

    if (shouldCopy) {
      if (targetExists) {
        const safety = path.join(p.DATA_DIR, `pre_migrate_${Date.now()}.db`);
        copyFileSafe(p.DB_PATH, safety);
        push(`Backup para migrimit: ${path.basename(safety)}`);
      }
      copyFileSafe(oldDb, p.DB_PATH);
      push(`Të dhënat u migruan te lokacioni i sigurt ← ${oldDb}`);
      out.migrated = true;
      out.from = oldDb;
    }

    try {
      const archived = oldDb + ".migrated";
      if (fs.existsSync(oldDb)) fs.renameSync(oldDb, archived);
      push(`Lokacioni i vjetër u arkivua: ${path.basename(archived)}`);
    } catch (e) {
      push(`Nuk u fshi lokacioni i vjetër (${oldDb}): ${e.message}`);
    }
  }

  try {
    const { app } = require("electron");
    const userData = app.getPath("userData");
    const oldInv = path.join(userData, "invoices");
    if (fs.existsSync(oldInv) && oldInv !== p.INVOICES_DIR) {
      copyDirRecursive(oldInv, p.INVOICES_DIR);
      push("Fotot e faturave u migruan nga userData/invoices");
      out.migrated = true;
    }
    const oldBk = path.join(userData, "backups");
    if (fs.existsSync(oldBk) && oldBk !== p.BACKUP_DIR_APPDATA) {
      copyDirRecursive(oldBk, p.BACKUP_DIR_APPDATA);
      push("Backup-et u migruan nga userData/backups");
      out.migrated = true;
    }
  } catch { /* ignore */ }

  return out;
}

module.exports = { migrateLegacyData, legacyLocations };
