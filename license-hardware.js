const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const LICENSE_STORAGE_REL = path.join("RevolutionInvest", "KontabilistiLicense");
const INSTALL_SALT_BASENAME = ".install-salt";

function appDataRoot(app) {
  if (app) {
    try {
      return app.getPath("appData");
    } catch {
      /* fall through */
    }
  }
  return process.env.APPDATA || path.join(require("os").homedir(), "AppData", "Roaming");
}

function licenseStorageRoot(app) {
  const root = path.join(appDataRoot(app), LICENSE_STORAGE_REL);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function installSaltPath(app) {
  return path.join(licenseStorageRoot(app), INSTALL_SALT_BASENAME);
}

/**
 * UUID i instalimit të parë — në %APPDATA%.
 * Mbijeton UPDATE. Fshihet VETËM me çinstalim të vërtetë (jo update).
 * Nëse ekziston → MOS e mbishkruaj kurrë.
 */
function ensureInstallSalt(app) {
  const p = installSaltPath(app);
  try {
    if (fs.existsSync(p)) {
      const existing = String(fs.readFileSync(p, "utf8") || "").trim();
      if (existing) return existing;
    }
  } catch {
    /* try create below */
  }
  const salt =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, salt, { encoding: "utf8", flag: "wx" });
  } catch (e) {
    if (e && (e.code === "EEXIST" || e.code === "EPERM")) {
      try {
        const again = String(fs.readFileSync(p, "utf8") || "").trim();
        if (again) return again;
      } catch {
        /* fall through */
      }
    }
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, salt, "utf8");
    } else {
      const again = String(fs.readFileSync(p, "utf8") || "").trim();
      if (again) return again;
    }
  }
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* ignore on Windows */
  }
  return salt;
}

function runCmd(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function parseWmicSerials(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const values = [];
  for (const line of lines) {
    if (/^serialnumber$/i.test(line)) continue;
    if (/^serial\s*number$/i.test(line)) continue;
    values.push(line);
  }
  return values.join("|");
}

function readBoardSerial() {
  const wmic = parseWmicSerials(runCmd("wmic baseboard get serialnumber"));
  if (wmic) return wmic;
  return String(
    runCmd(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_BaseBoard).SerialNumber"',
    ),
  ).trim();
}

function readDiskSerial() {
  const wmic = parseWmicSerials(runCmd("wmic diskdrive get serialnumber"));
  if (wmic) return wmic;
  return String(
    runCmd(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber"',
    ),
  ).trim();
}

/** Fingerprint hardware — format XXXX-XXXX-XXXX-XXXX (SHA256 board + disk + install-salt). */
function getDeviceId(app) {
  const board = readBoardSerial() || "NO-BOARD";
  const disk = readDiskSerial() || "NO-DISK";
  const installSalt = ensureInstallSalt(app);
  const hash = crypto
    .createHash("sha256")
    .update(`${board}::${disk}::${installSalt}`)
    .digest("hex")
    .toUpperCase();
  return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
}

function getDeviceFingerprint(app) {
  return getDeviceId(app);
}

module.exports = {
  getDeviceId,
  getDeviceFingerprint,
  ensureInstallSalt,
  readBoardSerial,
  readDiskSerial,
};
