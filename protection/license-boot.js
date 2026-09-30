/**
 * Boot licence cloud — thirret nga main.js (prod blocking).
 * Një dialog i errët — rihapet derisa licenca OK ose përdoruesi mbyll.
 */
const licenseGuard = require("../license-guard");

const NO_LICENSE_MSG = "Ky program nuk ka licencë aktive. Kontaktoni Revolution Invest.";

function loadCloud() {
  return require("./cloud-license");
}

function reasonFromValidation(v, cloud, fallback = "no_license") {
  if (cloud.isRevocationCode(v?.code)) return "revoked";
  if (v?.code === "EXPIRED") return "expired";
  if (v?.code === "OFFLINE_EXPIRED") return "offline_expired";
  if (v?.code === "OFFLINE_NEED_ACTIVATION") return "no_license";
  return fallback;
}

/** Offline grace: .cloud-lic + last_ok_at brenda 7 ditëve (si validateLicenseOnline). */
function allowOfflineGrace(cloud, app) {
  return cloud.isWithinCloudOfflineWindow(app) && !!cloud.readStoredLicense(app);
}

async function isProdLicenseSatisfied(cloud, app) {
  const claimed = await cloud.claimByHardwareId(app);
  if (claimed?.valid) return true;
  const v = await cloud.validateLicenseOnline(null, app);
  if (v.valid) return true;
  if (v.offline && allowOfflineGrace(cloud, app)) return true;
  return false;
}

/** Prod: loop me një dialog — pa ErrorBox, pa dialog të dytë paralel. */
async function runProdLicenseDialogUntilOk(app, initialReason = "no_license") {
  const cloud = loadCloud();
  cloud.registerInstallContext(app);

  let reason = initialReason;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await isProdLicenseSatisfied(cloud, app)) return true;

    const probe = await cloud.validateLicenseOnline(null, app, { skipHardFail: true });
    reason = reasonFromValidation(probe, cloud, reason);

    const activated = await licenseGuard.promptHardwareActivation(app, { reason });
    if (!activated) return false;

    if (await isProdLicenseSatisfied(cloud, app)) return true;

    const v = await cloud.validateLicenseOnline(null, app, { skipHardFail: true });
    reason = reasonFromValidation(v, cloud, reason);
  }
  return false;
}

async function bootKontabilistiLicense(app, { isProd, onRevoke, onHeartbeatOk }) {
  const cloud = loadCloud();
  cloud.registerInstallContext(app);

  try {
    const revokeBlock = await cloud.enforceRevokedBlock(app);
    if (revokeBlock.blocked) {
      try {
        cloud.wipeAllActivationData(app);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* vazhdo te aktivizimi HW — pa ErrorBox */
  }

  const localRevoke = cloud.readLocalRevokeBlock(app);
  const bootReason = localRevoke?.blocked ? "revoked" : "no_license";
  if (localRevoke?.blocked) cloud.clearLicenseRevokedLocally(app);

  if (!isProd) {
    cloud.startLicenseWatchdog(app, onRevoke, onHeartbeatOk);
    return true;
  }

  const ok = await runProdLicenseDialogUntilOk(app, bootReason);
  if (!ok) return false;

  cloud.startLicenseWatchdog(app, onRevoke, onHeartbeatOk);
  return true;
}

module.exports = {
  NO_LICENSE_MSG,
  bootKontabilistiLicense,
  runProdLicenseDialogUntilOk,
  isProdLicenseSatisfied,
  loadCloud,
};
