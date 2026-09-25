const fs = require("fs");
const path = require("path");
const {
  DB_PATH,
  DATA_DIR,
  BACKUP_DIR_APPDATA,
  BACKUP_DIR_MONTHLY,
  LAST_BACKUP_KEY,
  LAST_MONTHLY_BACKUP_KEY,
} = require("./data-paths");

const MAX_ROOT = 30;
const MAX_MONTHLY = 60;

function pad(n) {
  return String(n).padStart(2, "0");
}

function backupFileName(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `kontabilisti_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.db`;
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function monthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function previousMonthKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return monthKey(d);
}

function pruneRootBackups(max = MAX_ROOT) {
  if (!fs.existsSync(BACKUP_DIR_APPDATA)) return;
  const files = fs.readdirSync(BACKUP_DIR_APPDATA)
    .filter((f) => f.endsWith(".db") && f.startsWith("kontabilisti_"))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR_APPDATA, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(max)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR_APPDATA, old.f)); } catch { /* ignore */ }
  }
}

function pruneOld(dir, max = 30) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(max)) {
    try { fs.unlinkSync(path.join(dir, old.f)); } catch { /* ignore */ }
  }
}

function copyDb(destPath) {
  fs.copyFileSync(DB_PATH, destPath);
}

function ensureBackupDirs() {
  fs.mkdirSync(BACKUP_DIR_APPDATA, { recursive: true });
  fs.mkdirSync(BACKUP_DIR_MONTHLY, { recursive: true });
}

function countInDir(dir, rootOnly = false) {
  if (!fs.existsSync(dir)) return 0;
  if (rootOnly) {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".db") && f.startsWith("kontabilisti_")).length;
  }
  return fs.readdirSync(dir).filter((f) => f.endsWith(".db")).length;
}

function folderSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else total += st.size;
    }
  };
  walk(dir);
  return total;
}

/**
 * @param {object} db
 * @param {{ manual?: boolean, auto?: boolean }} opts
 */
function createBackup(db, opts = {}) {
  ensureBackupDirs();
  const name = backupFileName();
  const dest = path.join(BACKUP_DIR_APPDATA, name);
  copyDb(dest);
  pruneRootBackups(MAX_ROOT);

  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)").run(LAST_BACKUP_KEY, now);

  const isAuto = !!opts.auto;
  return {
    name,
    path: dest,
    auto: isAuto,
    manual: !!opts.manual,
    results: [{ ok: true, path: dest }],
    message: isAuto
      ? `💾 Backup automatik: ${name}`
      : `✅ Backup u krye: ${name}`,
  };
}

function shouldAutoBackup(db) {
  const row = db.prepare("SELECT value FROM db_meta WHERE key = ?").get(LAST_BACKUP_KEY);
  if (!row?.value) return true;
  return Date.now() - new Date(row.value).getTime() >= 24 * 3600 * 1000;
}

function createMonthlyBackupIfNeeded(db) {
  ensureBackupDirs();
  const prevMonth = previousMonthKey();
  const name = `kontabilisti_${prevMonth}.db`;
  const dest = path.join(BACKUP_DIR_MONTHLY, name);
  if (fs.existsSync(dest)) return null;
  copyDb(dest);
  pruneOld(BACKUP_DIR_MONTHLY, MAX_MONTHLY);
  db.prepare("INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)").run(LAST_MONTHLY_BACKUP_KEY, prevMonth);
  return { name, type: "monthly", month: prevMonth, path: dest, message: `Backup mujor: ${name}` };
}

function runAutoBackups(db) {
  const out = { daily: null, monthly: null, error: null };
  try {
    if (shouldAutoBackup(db)) {
      out.daily = createBackup(db, { auto: true });
    }
    out.monthly = createMonthlyBackupIfNeeded(db);
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

function listBackups() {
  const all = [];
  if (fs.existsSync(BACKUP_DIR_APPDATA)) {
    for (const f of fs.readdirSync(BACKUP_DIR_APPDATA).filter((x) => x.endsWith(".db") && x.startsWith("kontabilisti_"))) {
      const full = path.join(BACKUP_DIR_APPDATA, f);
      all.push({ name: f, path: full, dir: BACKUP_DIR_APPDATA, type: "auto", mtime: fs.statSync(full).mtime.toISOString() });
    }
  }
  if (fs.existsSync(BACKUP_DIR_MONTHLY)) {
    for (const f of fs.readdirSync(BACKUP_DIR_MONTHLY).filter((x) => x.endsWith(".db"))) {
      const full = path.join(BACKUP_DIR_MONTHLY, f);
      all.push({ name: f, path: full, dir: BACKUP_DIR_MONTHLY, type: "monthly", mtime: fs.statSync(full).mtime.toISOString() });
    }
  }
  const ext = "C:\\KontabilistiBackups";
  if (fs.existsSync(ext)) {
    for (const f of fs.readdirSync(ext).filter((x) => x.endsWith(".db"))) {
      const full = path.join(ext, f);
      all.push({ name: f, path: full, dir: ext, type: "external", mtime: fs.statSync(full).mtime.toISOString() });
    }
  }
  return all.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) throw new Error("Backup nuk u gjet");
  ensureBackupDirs();
  const db = require("./database").getDb();
  createBackup(db, { manual: true });
  const safety = path.join(DATA_DIR, `pre_restore_${timestamp()}.db`);
  if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, safety);
  fs.copyFileSync(backupPath, DB_PATH);
  return { restored: backupPath, safety };
}

function dbSizeBytes() {
  try { return fs.statSync(DB_PATH).size; } catch { return 0; }
}

function countBackups() {
  const root = countInDir(BACKUP_DIR_APPDATA, true);
  const monthly = countInDir(BACKUP_DIR_MONTHLY);
  return { daily: root, monthly, total: root + monthly };
}

function lastBackupTime(db) {
  const row = db.prepare("SELECT value FROM db_meta WHERE key = ?").get(LAST_BACKUP_KEY);
  return row?.value || null;
}

function backupInfo(db) {
  const counts = countBackups();
  return {
    last_backup: lastBackupTime(db),
    backup_count: counts.total,
    backup_count_daily: counts.daily,
    backup_count_monthly: counts.monthly,
    backup_size_bytes: folderSizeBytes(BACKUP_DIR_APPDATA),
    backup_dir: BACKUP_DIR_APPDATA,
  };
}

module.exports = {
  createBackup,
  shouldAutoBackup,
  createMonthlyBackupIfNeeded,
  runAutoBackups,
  listBackups,
  restoreBackup,
  dbSizeBytes,
  countBackups,
  lastBackupTime,
  backupInfo,
  backupFolderSizeBytes: () => folderSizeBytes(BACKUP_DIR_APPDATA),
  ensureBackupDirs,
  BACKUP_DIR_APPDATA,
  BACKUP_DIR_MONTHLY,
  MAX_ROOT,
  backupFileName,
};
