/**
 * Cloud license — device_id, heartbeat via /check, offline 7 ditë, revoke.
 * Storage: %AppData%\\RevolutionInvest\\KontabilistiLicense\\
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const cloudHealth = require("./cloud-health");

const LICENSE_STORAGE_REL = path.join("RevolutionInvest", "KontabilistiLicense");
const KEY_FILE = ".cloud-lic";
const DEVICE_FILE = ".install-device-id";
const ACTIVATION_FILE = ".cloud-activation.json";
const REVOKED_FILE = ".lic-revoked";
const CLOUD_OFFLINE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const HEARTBEAT_MS = 45 * 1000;
const APP_TYPE = "kontabilisti";
const NO_LICENSE_MESSAGE = "Ky program nuk ka licencë aktive. Kontaktoni Revolution Invest.";

const HARD_LICENSE_FAIL_CODES = new Set([
  "REVOKED",
  "SUSPENDED",
  "EXPIRED",
  "NOT_FOUND",
  "WRONG_APP",
  "DEVICE_MISMATCH",
  "TERMINAL_LIMIT_EXCEEDED",
]);

const REVOCATION_FAIL_CODES = new Set(["NOT_FOUND", "REVOKED", "SUSPENDED"]);
const HEARTBEAT_FORCE_LOGOUT_CODES = new Set(["REVOKED", "NOT_FOUND", "SUSPENDED"]);

let _electronApp = null;
let _watchdogTimer = null;
let _watchdogInFlight = false;

function registerInstallContext(app) {
  _electronApp = app || _electronApp;
}

function storageRoot(app) {
  const ea = app || _electronApp;
  const base = ea ? ea.getPath("appData") : process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const root = path.join(base, LICENSE_STORAGE_REL);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function createInstallDeviceId() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function getMachineId(_app) {
  const raw = [os.hostname(), os.userInfo().username, os.platform(), os.arch()].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12).toUpperCase();
}

function getHardwareIdForDisplay(app) {
  try {
    const lg = require("../license-guard");
    return lg.formatHardwareId(lg.getHardwareId(app || _electronApp));
  } catch {
    return "";
  }
}

function normalizeKey(key) {
  return String(key || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function readStoredLicense(app) {
  try {
    const p = path.join(storageRoot(app), KEY_FILE);
    if (!fs.existsSync(p)) return "";
    return String(fs.readFileSync(p, "utf8") || "").trim();
  } catch {
    return "";
  }
}

function writeStoredLicense(app, marker) {
  const m = String(marker || "ACTIVE").trim();
  if (!m) throw new Error("Licenca lokale e pavlefshme.");
  fs.writeFileSync(path.join(storageRoot(app), KEY_FILE), m, "utf8");
}

function clearStoredLicense(app) {
  try { fs.unlinkSync(path.join(storageRoot(app), KEY_FILE)); } catch { /* ignore */ }
}

function writeActivationRecord(app, extra = {}) {
  const device_id = getHardwareIdForDisplay(app);
  const row = {
    device_id,
    install_device_id: getMachineId(app),
    last_ok_at: new Date().toISOString(),
    app_type: APP_TYPE,
    ...extra,
  };
  fs.writeFileSync(path.join(storageRoot(app), ACTIVATION_FILE), JSON.stringify(row, null, 2), "utf8");
}

function clearActivationRecord(app) {
  try { fs.unlinkSync(path.join(storageRoot(app), ACTIVATION_FILE)); } catch { /* ignore */ }
}

function readActivationRecord(app) {
  try {
    const p = path.join(storageRoot(app), ACTIVATION_FILE);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function isWithinCloudOfflineWindow(_app) {
  return true;
}

function offlineExpiredMessage() {
  return "Pa internet më shumë se 7 ditë. Lidhuni online për të vazhduar (licenca duhet të jetë aktive).";
}

function markLicenseRevokedLocally(app, message) {
  fs.writeFileSync(
    path.join(storageRoot(app), REVOKED_FILE),
    JSON.stringify({ at: new Date().toISOString(), message: String(message || "Licenca u çaktivizua.") }),
    "utf8",
  );
}

function clearLicenseRevokedLocally(app) {
  try { fs.unlinkSync(path.join(storageRoot(app), REVOKED_FILE)); } catch { /* ignore */ }
}

function readLocalRevokeBlock(app) {
  try {
    const p = path.join(storageRoot(app), REVOKED_FILE);
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return { blocked: true, message: j.message || "Licenca është e çaktivizuar." };
  } catch {
    return null;
  }
}

/** Vetëm skedarët në %AppData%\\RevolutionInvest\\KontabilistiLicense\\ — jo DB, jo DATA_DIR biznesi. */
const LICENSE_ARTIFACT_BASENAMES = new Set([
  KEY_FILE,
  ACTIVATION_FILE,
  REVOKED_FILE,
  DEVICE_FILE,
]);

function purgeAllLicenseArtifacts(app, message, opts = {}) {
  registerInstallContext(app);
  const allowReactivation = opts.allowReactivation !== false;
  if (allowReactivation) clearLicenseRevokedLocally(app);
  else markLicenseRevokedLocally(app, String(message || NO_LICENSE_MESSAGE));
  clearStoredLicense(app);
  clearActivationRecord(app);
  try {
    const root = storageRoot(app);
    const hwLic = path.join(root, ".hw-lic");
    if (fs.existsSync(hwLic)) fs.unlinkSync(hwLic);
    for (const base of LICENSE_ARTIFACT_BASENAMES) {
      if (base === KEY_FILE || base === ACTIVATION_FILE || base === REVOKED_FILE) continue;
      const p = path.join(root, base);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch {
    /* ignore — purge licencë vetëm */
  }
}

function mapCheckPayload(parsed, httpStatus) {
  if (httpStatus < 400 && parsed.valid) {
    return {
      valid: true,
      code: "OK",
      message: parsed.business_name ? `Licenca aktive — ${parsed.business_name}` : "Licenca aktive",
      business_name: parsed.business_name,
      expires_at: parsed.expires_at,
      plan: parsed.plan,
      scans_remaining: parsed.scans_remaining,
    };
  }
  const st = String(parsed.status || parsed.code || "").toLowerCase();
  if (st === "suspended") {
    return { valid: false, code: "REVOKED", message: parsed.message || "Licenca u çaktivizua.", force_logout: true };
  }
  if (st === "expired") {
    return { valid: false, code: "EXPIRED", message: parsed.message || "Licenca ka skaduar." };
  }
  if (st === "not_found" || httpStatus === 404) {
    return { valid: false, code: "NOT_FOUND", message: parsed.message || "Licenca nuk është regjistruar për këtë pajisje." };
  }
  return {
    valid: false,
    code: parsed.code || "INVALID",
    message: parsed.message || parsed.error || "Licenca nuk është aktive.",
  };
}

async function postDeviceCheck(app, extra = {}) {
  const device_id = getHardwareIdForDisplay(app);
  if (!device_id) throw new Error("Mungon Hardware ID.");
  const res = await cloudHealth.requestJson("POST", "/api/license/check", {
    device_id,
    app_type: APP_TYPE,
    hostname: os.hostname(),
    install_device_id: getMachineId(app),
    ...extra,
  });
  let parsed = {};
  try { parsed = JSON.parse(res.data || "{}"); } catch { parsed = {}; }
  return { status: res.status, parsed, mapped: mapCheckPayload(parsed, res.status) };
}

function persistValidCheck(app, mapped, parsed = {}) {
  clearLicenseRevokedLocally(app);
  writeStoredLicense(app, getHardwareIdForDisplay(app));
  writeActivationRecord(app, {
    business_name: mapped.business_name || parsed.business_name,
    expires_at: mapped.expires_at || parsed.expires_at,
    plan: mapped.plan || parsed.plan,
    license_key: parsed.license_key || null,
  });
}

async function validateLicenseOnline(_key, app) {
  registerInstallContext(app);
  try {
    const { mapped, parsed } = await postDeviceCheck(app);
    if (mapped.valid) {
      persistValidCheck(app, mapped, parsed);
      return mapped;
    }
    if (mapped.code === "REVOKED" || mapped.code === "NOT_FOUND") {
      purgeAllLicenseArtifacts(app, mapped.message || NO_LICENSE_MESSAGE);
    }
    return mapped;
  } catch (err) {
    if (isWithinCloudOfflineWindow(app) && readStoredLicense(app)) {
      return { valid: true, offline: true, message: "Pa internet — licenca lokale.", code: "OK" };
    }
    return {
      valid: false,
      code: "OFFLINE",
      message: err.message || "Pa internet — aktivizoni licencën kur jeni online.",
      offline: true,
    };
  }
}

async function validateLicenseHeartbeat(_key, app) {
  const a = app || _electronApp;
  try {
    const { mapped, parsed } = await postDeviceCheck(a);
    if (mapped.valid) {
      persistValidCheck(a, mapped, parsed);
      return { ...mapped, offline: false };
    }
    if (mapped.code && isRevocationCode(mapped.code)) {
      purgeAllLicenseArtifacts(a, mapped.message || NO_LICENSE_MESSAGE, { allowReactivation: true });
    }
    const forceLogout =
      !!mapped.force_logout ||
      (mapped.code && HEARTBEAT_FORCE_LOGOUT_CODES.has(mapped.code));
    return { ...mapped, force_logout: forceLogout, offline: false };
  } catch {
    const localRevoke = readLocalRevokeBlock(a);
    if (localRevoke?.blocked) {
      return { valid: false, code: "REVOKED", force_logout: true, message: localRevoke.message };
    }
    if (isWithinCloudOfflineWindow(a) && readStoredLicense(a)) {
      return { valid: true, offline: true, message: "Pa internet — heartbeat (licenca lokale).", code: "OK" };
    }
    return { valid: true, offline: true, message: "Pa internet — vazhdon me licencë të ruajtur.", code: "OK" };
  }
}

async function claimByHardwareId(app) {
  registerInstallContext(app);
  const result = await validateLicenseOnline(null, app);
  if (result.valid) {
    return {
      valid: true,
      code: result.code || "OK",
      message: result.message || "Licenca u gjet nga Hardware ID.",
      device_id: getHardwareIdForDisplay(app),
    };
  }
  return result;
}

async function activateWithKey(app, license_key, { email } = {}) {
  registerInstallContext(app);
  const device_id = getHardwareIdForDisplay(app);
  const key = String(license_key || "").trim();
  const em = String(email || "").trim().toLowerCase();
  if (!key) throw new Error("Mungon çelësi i licencës.");
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error("Shkruani email të vlefshëm.");

  const res = await cloudHealth.requestJson("POST", "/api/license/activate", {
    device_id,
    license_key: key,
    email: em,
    app_type: APP_TYPE,
    hostname: os.hostname(),
    install_device_id: getMachineId(app),
  });
  let parsed = {};
  try { parsed = JSON.parse(res.data || "{}"); } catch { parsed = {}; }

  if (res.status < 400 && parsed.valid) {
    persistValidCheck(app, mapCheckPayload(parsed, res.status), { ...parsed, license_key: key });
    return { valid: true, message: parsed.message || "Licenca u aktivizua", code: "OK" };
  }

  const mapped = mapCheckPayload(parsed, res.status);
  if (mapped.code === "REVOKED" || mapped.code === "NOT_FOUND") {
    purgeAllLicenseArtifacts(app, mapped.message || NO_LICENSE_MESSAGE);
  }
  const err = new Error(mapped.message || "Aktivizimi dështoi.");
  err.code = mapped.code || "INVALID";
  throw err;
}

function readHwLicCloudRecord(app) {
  try {
    const p = path.join(storageRoot(app), ".hw-lic");
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (j && j.key && j.source === "cloud") return j;
  } catch {
    /* ignore */
  }
  return null;
}

async function ensureCloudHwLicenseStartup(app) {
  registerInstallContext(app);
  const hwRec = readHwLicCloudRecord(app);
  if (!hwRec || hwRec.source !== "cloud") {
    return { ok: true };
  }
  const localMark = readStoredLicense(app);
  try {
    const online = await validateLicenseOnline(null, app);
    if (online.valid && !online.offline) {
      return { ok: true };
    }
    if (online.offline) {
      if (!localMark) return { ok: false, reason: "no_license" };
      return { ok: true };
    }
    purgeAllLicenseArtifacts(app, online.message || NO_LICENSE_MESSAGE, { allowReactivation: true });
    return { ok: false, reason: "no_license" };
  } catch {
    if (!localMark) return { ok: false, reason: "no_license" };
    return { ok: true };
  }
}

function startLicenseWatchdog(app, onForceLogout, onHeartbeatOk) {
  registerInstallContext(app);
  if (_watchdogTimer) return;
  const runTick = async () => {
    if (_watchdogInFlight) return;
    _watchdogInFlight = true;
    try {
      const localMark = readStoredLicense(app);
      const hwRec = readHwLicCloudRecord(app);
      if (!localMark && !hwRec) return;
      const beat = await validateLicenseHeartbeat(null, app);
      if (beat.valid || beat.offline) {
        if (beat.valid && typeof onHeartbeatOk === "function") onHeartbeatOk(beat);
        return;
      }
      if (
        beat.force_logout ||
        (beat.code && HARD_LICENSE_FAIL_CODES.has(beat.code))
      ) {
        if (isRevocationCode(beat.code)) {
          purgeAllLicenseArtifacts(app, beat.message || NO_LICENSE_MESSAGE, { allowReactivation: true });
        } else {
          clearStoredLicense(app);
          clearActivationRecord(app);
        }
        if (typeof onForceLogout === "function") onForceLogout(beat);
      }
    } catch (e) {
      console.warn("[cloud-license] watchdog:", e.message || e);
    } finally {
      _watchdogInFlight = false;
    }
  };
  runTick();
  _watchdogTimer = setInterval(runTick, HEARTBEAT_MS);
  if (typeof _watchdogTimer.unref === "function") _watchdogTimer.unref();
}

function isRevocationCode(code) {
  return REVOCATION_FAIL_CODES.has(String(code || "").trim());
}

function isLicenseActiveLocally(app) {
  return !!readStoredLicense(app) && !!readActivationRecord(app);
}

module.exports = {
  APP_TYPE,
  CLOUD_OFFLINE_MAX_MS,
  HEARTBEAT_MS,
  HARD_LICENSE_FAIL_CODES,
  REVOCATION_FAIL_CODES,
  NO_LICENSE_MESSAGE,
  registerInstallContext,
  getMachineId,
  getHardwareIdForDisplay,
  readStoredLicense,
  writeStoredLicense,
  clearStoredLicense,
  purgeAllLicenseArtifacts,
  isRevocationCode,
  activateWithKey,
  claimByHardwareId,
  validateLicenseOnline,
  validateLicenseHeartbeat,
  startLicenseWatchdog,
  ensureCloudHwLicenseStartup,
  readHwLicCloudRecord,
  isWithinCloudOfflineWindow,
  markLicenseRevokedLocally,
  clearLicenseRevokedLocally,
  readLocalRevokeBlock,
  readActivationRecord,
  offlineExpiredMessage,
  isLicenseActiveLocally,
};
