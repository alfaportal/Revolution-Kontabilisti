const path = require("path");
const { verifyIntegrity } = require("./integrity-check");
const { ensureDeviceLock } = require("./device-lock");
const { appendSecurityLog } = require("./security-log");
const { ADMIN_CONTACT } = require("./constants");

function isProtectionEnabled() {
  return process.env.KONTABILISTI_PROTECTED === "1" && process.env.DEV_MODE !== "true";
}

/**
 * Kontrollet e sigurisë kur hapet programi (production).
 * @param {{ appRoot: string, dataDir: string, getDb: () => object, dialog?: object, app?: object }} ctx
 */
function runSecurityChecks(ctx) {
  const { appRoot, dataDir, getDb, dialog, app } = ctx;

  if (!isProtectionEnabled()) return { ok: true, skipped: true };

  const deviceId = require("../license-hardware").getDeviceId();

  const integrity = verifyIntegrity(appRoot);
  if (!integrity.ok) {
    appendSecurityLog(dataDir, `INTEGRITY FAIL device=${deviceId} — ${integrity.error}`);
    if (dialog?.showErrorBox) {
      dialog.showErrorBox(
        "Gabim Sigurie",
        "Skedarët e programit janë ndryshuar. Programi nuk mund të hapet.\n\n" +
        "Instaloni versionin origjinal ose kontaktoni:\n" + ADMIN_CONTACT
      );
    }
    return { ok: false, step: "integrity", ...integrity };
  }

  let db;
  try {
    db = getDb();
  } catch (e) {
    appendSecurityLog(dataDir, `DB FAIL device=${deviceId} — ${e.message}`);
    if (dialog?.showErrorBox) {
      dialog.showErrorBox(
        "Gabim Sigurie",
        "Databaza nuk u hap. Të dhënat mund të jenë nga kompjuter tjetër ose të dëmtuara.\n\n" +
        ADMIN_CONTACT
      );
    }
    return { ok: false, step: "database", error: e.message };
  }

  const lock = ensureDeviceLock(db);
  if (!lock.ok) {
    appendSecurityLog(dataDir, `DEVICE LOCK FAIL device=${deviceId} expected=${lock.expected || "—"} — ${lock.error}`);
    if (dialog?.showErrorBox) {
      dialog.showErrorBox("Gabim Licencimi", lock.error || "Pajisja nuk autorizohet.");
    }
    return { ok: false, step: "device", ...lock };
  }

  appendSecurityLog(dataDir, `Security OK device=${deviceId}`);
  return { ok: true, deviceId };
}

module.exports = { runSecurityChecks, isProtectionEnabled };
