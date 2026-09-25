const { getDeviceId } = require("../license-hardware");
const { DEVICE_MISMATCH, COPY_MESSAGE } = require("./constants");

function isProtectionEnabled() {
  return process.env.KONTABILISTI_PROTECTED === "1" && process.env.DEV_MODE !== "true";
}

function readBoundDeviceId(db) {
  try {
    const row = db.prepare("SELECT value FROM db_meta WHERE key='bound_device_id'").get();
    return row?.value || null;
  } catch {
    return null;
  }
}

function bindDeviceId(db, deviceId) {
  db.exec(`CREATE TABLE IF NOT EXISTS db_meta (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare("INSERT OR REPLACE INTO db_meta (key, value) VALUES ('bound_device_id', ?)").run(deviceId);
}

/**
 * Kontrollon / vendos lidhjen hardware.
 * @returns {{ ok: boolean, error?: string, bound?: boolean, deviceId?: string }}
 */
function ensureDeviceLock(db) {
  if (!isProtectionEnabled()) {
    return { ok: true, skipped: true, deviceId: getDeviceId() };
  }

  const current = getDeviceId();
  if (!current || current === "ERROR-DEVICE-ID") {
    return { ok: false, error: DEVICE_MISMATCH, deviceId: current };
  }

  const bound = readBoundDeviceId(db);
  if (!bound) {
    bindDeviceId(db, current);
    return { ok: true, bound: true, deviceId: current };
  }

  if (bound !== current) {
    return {
      ok: false,
      error: COPY_MESSAGE,
      deviceId: current,
      expected: bound,
    };
  }

  return { ok: true, deviceId: current };
}

module.exports = { ensureDeviceLock, readBoundDeviceId, bindDeviceId, isProtectionEnabled };
