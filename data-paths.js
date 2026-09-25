const path = require("path");
const os = require("os");
const fs = require("fs");

/** Hub në AppData — pa "revolution"; çdo biznes ka nën-folderin e vet */
const APP_HUB_NAME = "Kontabilisti";
const LEGACY_APP_NAME = "revolution-kontabilisti";
const SETUP_FOLDER = "_setup";
const PROFILE_FILENAME = "profile.json";

function appDataRoaming() {
  return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
}

function getHubDir() {
  return path.join(appDataRoaming(), APP_HUB_NAME);
}

function profilePath() {
  return path.join(getHubDir(), PROFILE_FILENAME);
}

function readProfile() {
  try {
    const raw = fs.readFileSync(profilePath(), "utf8");
    const data = JSON.parse(raw);
    if (data?.folder && typeof data.folder === "string") return data;
  } catch { /* ignore */ }
  return null;
}

function writeProfile(folder) {
  const hub = getHubDir();
  fs.mkdirSync(hub, { recursive: true });
  fs.writeFileSync(
    profilePath(),
    JSON.stringify({ folder, updated_at: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function slugifyPart(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55);
}

/** Emri i folderit sipas emrit të biznesit + komuna */
function businessFolderName(settings) {
  const trade = settings?.business_trade_name?.trim();
  const legal = settings?.business_legal_name?.trim();
  const muni = settings?.municipality?.trim();
  const name = trade || legal;
  const parts = [slugifyPart(name), slugifyPart(muni)].filter(Boolean);
  if (!parts.length) return SETUP_FOLDER;
  return parts.join("-") || SETUP_FOLDER;
}

function uniqueFolderName(hub, base, preferred) {
  if (!base || base === SETUP_FOLDER) return SETUP_FOLDER;
  if (preferred && fs.existsSync(path.join(hub, preferred))) return preferred;
  const primary = path.join(hub, base);
  if (fs.existsSync(primary)) return base;
  let candidate = base;
  let n = 2;
  while (fs.existsSync(path.join(hub, candidate))) {
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 99) return `${base}-${Date.now()}`;
  }
  return candidate;
}

function legacyDataDir() {
  return path.join(appDataRoaming(), LEGACY_APP_NAME);
}

/** Burim i saktë: %APPDATA%\\Kontabilisti\\{Emri-Biznesit-Komuna}\\ */
function resolveDataDir() {
  if (process.env.KONTABILISTI_DATA_DIR) return process.env.KONTABILISTI_DATA_DIR;

  const hub = getHubDir();
  const profile = readProfile();
  if (profile?.folder) {
    return path.join(hub, profile.folder);
  }

  const legacy = legacyDataDir();
  if (fs.existsSync(path.join(legacy, "kontabilisti.db"))) {
    return legacy;
  }

  return path.join(hub, SETUP_FOLDER);
}

function copyTreeMerge(src, dest) {
  if (!fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === PROFILE_FILENAME && path.normalize(src) === path.normalize(getHubDir())) continue;
      copyTreeMerge(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
}

/**
 * Pas regjistrimit të biznesit, zhvendos të dhënat te folderi i emrit.
 * @returns {{ moved: boolean, folder?: string, from?: string, to?: string }}
 */
function syncBusinessDataFolder(settings) {
  const legal = settings?.business_legal_name?.trim();
  const muni = settings?.municipality?.trim();
  if (!legal || !muni) return { moved: false };

  const hub = getHubDir();
  fs.mkdirSync(hub, { recursive: true });

  const desiredBase = businessFolderName(settings);
  const profile = readProfile();
  const currentDir = path.normalize(process.env.KONTABILISTI_DATA_DIR || resolveDataDir());
  const folder = uniqueFolderName(hub, desiredBase, profile?.folder);
  const targetDir = path.normalize(path.join(hub, folder));
  const targetDb = path.join(targetDir, "kontabilisti.db");
  const sourceDb = path.join(currentDir, "kontabilisti.db");

  const pointToTarget = () => {
    writeProfile(folder);
    process.env.KONTABILISTI_DATA_DIR = targetDir;
  };

  if (currentDir === targetDir && fs.existsSync(targetDb)) {
    if (!profile?.folder) pointToTarget();
    else process.env.KONTABILISTI_DATA_DIR = targetDir;
    return { moved: false, folder, to: targetDir };
  }

  if (fs.existsSync(targetDb) && profile?.folder === folder) {
    process.env.KONTABILISTI_DATA_DIR = targetDir;
    return { moved: currentDir !== targetDir, folder, from: currentDir, to: targetDir };
  }

  if (!fs.existsSync(targetDb) && fs.existsSync(sourceDb)) {
    copyTreeMerge(currentDir, targetDir);
  }

  pointToTarget();
  const moved = currentDir !== targetDir;
  return { moved, folder, from: moved ? currentDir : undefined, to: targetDir };
}

/** Për UI — %APPDATA%\\Kontabilisti\\... pa "revolution" */
function formatDisplayPath(absPath) {
  if (!absPath) return "";
  let out = String(absPath).replace(/\\/g, "\\");
  out = out.replace(/.*[\\/]AppData[\\/]Roaming[\\/]/i, "%APPDATA%\\");
  out = out.replace(/revolution-kontabilisti/gi, "Kontabilisti");
  if (!out.endsWith("\\") && !out.endsWith("/")) out += "\\";
  return out;
}

function getPaths() {
  const DATA_DIR = resolveDataDir();
  return {
    APP_HUB_NAME,
    APP_NAME: APP_HUB_NAME,
    DATA_DIR,
    HUB_DIR: getHubDir(),
    DB_PATH: process.env.KONTABILISTI_DB_PATH || path.join(DATA_DIR, "kontabilisti.db"),
    BACKUP_DIR_APPDATA: path.join(DATA_DIR, "backups"),
    BACKUP_DIR_DAILY: path.join(DATA_DIR, "backups", "daily"),
    BACKUP_DIR_MONTHLY: path.join(DATA_DIR, "backups", "monthly"),
    BACKUP_DIR_EXTERNAL: "C:\\KontabilistiBackups",
    INVOICES_DIR: path.join(DATA_DIR, "invoices"),
    EXPORTS_DIR: path.join(DATA_DIR, "exports"),
    SCANS_DIR: path.join(DATA_DIR, "scans"),
    LICENSE_PATH: path.join(DATA_DIR, "license.json"),
    LAST_BACKUP_KEY: "last_auto_backup",
    LAST_MONTHLY_BACKUP_KEY: "last_monthly_backup_month",
  };
}

const SCAN_TYPE_DIRS = {
  z_report: "z-reports",
  b2b_sales: "b2b",
  purchase: "purchases",
  expense: "expenses",
  client: "clients",
  business_cert: "certificates",
};

function ensureDirs() {
  const p = getPaths();
  fs.mkdirSync(p.HUB_DIR, { recursive: true });
  fs.mkdirSync(p.DATA_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(p.DB_PATH), { recursive: true });
  fs.mkdirSync(p.BACKUP_DIR_APPDATA, { recursive: true });
  fs.mkdirSync(p.BACKUP_DIR_DAILY, { recursive: true });
  fs.mkdirSync(p.BACKUP_DIR_MONTHLY, { recursive: true });
  fs.mkdirSync(p.INVOICES_DIR, { recursive: true });
  fs.mkdirSync(p.EXPORTS_DIR, { recursive: true });
  fs.mkdirSync(p.SCANS_DIR, { recursive: true });
  for (const sub of Object.values(SCAN_TYPE_DIRS)) {
    fs.mkdirSync(path.join(p.SCANS_DIR, sub), { recursive: true });
  }
  try {
    fs.mkdirSync(p.BACKUP_DIR_EXTERNAL, { recursive: true });
  } catch {
    /* ignore */
  }
}

/** Thirret në fillim të main.js para require të databazës */
function initElectronDataDir() {
  if (process.env.KONTABILISTI_DATA_DIR) return getPaths().DATA_DIR;
  try {
    require("electron");
    process.env.KONTABILISTI_DATA_DIR = resolveDataDir();
  } catch {
    process.env.KONTABILISTI_DATA_DIR = resolveDataDir();
  }
  return getPaths().DATA_DIR;
}

module.exports = {
  APP_HUB_NAME,
  APP_NAME: APP_HUB_NAME,
  LEGACY_APP_NAME,
  SETUP_FOLDER,
  resolveDataDir,
  getHubDir,
  readProfile,
  writeProfile,
  businessFolderName,
  syncBusinessDataFolder,
  formatDisplayPath,
  getPaths,
  ensureDirs,
  initElectronDataDir,
  get DATA_DIR() { return getPaths().DATA_DIR; },
  get DB_PATH() { return getPaths().DB_PATH; },
  get BACKUP_DIR_APPDATA() { return getPaths().BACKUP_DIR_APPDATA; },
  get BACKUP_DIR_DAILY() { return getPaths().BACKUP_DIR_DAILY; },
  get BACKUP_DIR_MONTHLY() { return getPaths().BACKUP_DIR_MONTHLY; },
  get BACKUP_DIR_EXTERNAL() { return getPaths().BACKUP_DIR_EXTERNAL; },
  get INVOICES_DIR() { return getPaths().INVOICES_DIR; },
  get EXPORTS_DIR() { return getPaths().EXPORTS_DIR; },
  get SCANS_DIR() { return getPaths().SCANS_DIR; },
  SCAN_TYPE_DIRS,
  get LICENSE_PATH() { return getPaths().LICENSE_PATH; },
  get LAST_BACKUP_KEY() { return getPaths().LAST_BACKUP_KEY; },
  get LAST_MONTHLY_BACKUP_KEY() { return getPaths().LAST_MONTHLY_BACKUP_KEY; },
};
