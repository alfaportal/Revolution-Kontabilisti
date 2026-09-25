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
  return fallback;
}

async function isProdLicenseSatisfied(cloud, app) {
  const claimed = await cloud.claimByHardwareId(app);
  if (claimed?.valid) return true;
  const v = await cloud.validateLicenseOnline(null, app);
  return !!(v.valid || v.offline);
}

/** Prod: loop me një dialog — pa ErrorBox, pa dialog të dytë paralel. */
async function runProdLicenseDialogUntilOk(app, initialReason = "no_license") {
  const cloud = loadCloud();
  cloud.registerInstallContext(app);

  let reason = initialReason;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await isProdLicenseSatisfied(cloud, app)) return true;

    const activated = await licenseGuard.promptHardwareActivation(app, { reason });
    if (!activated) return false;

    if (await isProdLicenseSatisfied(cloud, app)) return true;

    const v = await cloud.validateLicenseOnline(null, app, { skipHardFail: true });
    reason = reasonFromValidation(v, cloud, "no_license");
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
