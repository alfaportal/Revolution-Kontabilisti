const { table } = require("./supabase");

function normalizeKey(k) {
  return String(k || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeDeviceId(id) {
  return String(id || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

async function fetchLicense(licenseKey) {
  const key = normalizeKey(licenseKey);
  const { data, error } = await table().select("*").eq("license_key", key).maybeSingle();
  if (error) {
    console.error("[license] db error:", error.message);
    return { ok: false, error: "Gabim verifikimi licence", code: "license_db_error" };
  }
  if (!data || data.active === false) {
    return { ok: false, error: "Licenca e pavlefshme ose e çaktivizuar", code: "invalid_license" };
  }
  return { ok: true, license: data };
}

function checkExpiry(license) {
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return { ok: false, error: "Licenca ka skaduar — kontaktoni Revolution", code: "license_expired" };
  }
  return { ok: true };
}

function checkScanLimit(license) {
  const limit = Number(license.scans_limit);
  const used = Number(license.scans_used || 0);
  if (limit > 0 && used >= limit) {
    return { ok: false, error: "Limiti i skanimeve AI u arrit", code: "scan_limit" };
  }
  return { ok: true, scans_remaining: limit > 0 ? Math.max(0, limit - used) : null };
}

function checkNui(license, nui) {
  if (!license.nui || !nui) return { ok: true };
  const a = String(license.nui).replace(/\D/g, "");
  const b = String(nui).replace(/\D/g, "");
  if (a && b && a !== b) {
    return { ok: false, error: "Licenca nuk i përket këtij biznesi (NUI)", code: "nui_mismatch" };
  }
  return { ok: true };
}

function checkDevice(license, deviceId) {
  const dev = normalizeDeviceId(deviceId);
  if (!dev) return { ok: true };
  const bound = normalizeDeviceId(license.device_id);
  if (!bound) return { ok: true, needs_activation: true };
  if (bound !== dev) {
    return {
      ok: false,
      error: "Licenca është aktivizuar në një pajisje tjetër",
      code: "device_mismatch",
    };
  }
  return { ok: true, needs_activation: false };
}

async function activateLicense(licenseKey, { deviceId, nui, businessName } = {}) {
  const key = normalizeKey(licenseKey);
  const dev = normalizeDeviceId(deviceId);
  if (!key || key.length < 8) {
    return { ok: false, error: "Licenca e pavlefshme", code: "invalid_license" };
  }
  if (!dev || dev.length < 8) {
    return { ok: false, error: "ID e pajisjes mungon", code: "missing_device" };
  }

  const fetched = await fetchLicense(key);
  if (!fetched.ok) return fetched;
  const license = fetched.license;

  let exp = checkExpiry(license);
  if (!exp.ok) return exp;
  exp = checkNui(license, nui);
  if (!exp.ok) return exp;

  const bound = normalizeDeviceId(license.device_id);
  if (bound && bound !== dev) {
    return {
      ok: false,
      error: "Licenca është aktivizuar në një pajisje tjetër",
      code: "device_mismatch",
    };
  }

  if (!bound) {
    const { error } = await table()
      .update({ device_id: dev, activated_at: new Date().toISOString() })
      .eq("id", license.id);
    if (error) {
      console.error("[license] activate error:", error.message);
      return { ok: false, error: "Gabim aktivizimi", code: "activate_error" };
    }
    license.device_id = dev;
    license.activated_at = new Date().toISOString();
  }

  const limit = checkScanLimit(license);
  return {
    ok: true,
    message: "Licenca u aktivizua",
    business_name: license.business_name || businessName,
    expires_at: license.expires_at,
    scans_remaining: limit.scans_remaining,
    device_id: dev,
  };
}

async function validateLicense(licenseKey, { deviceId, nui, businessName } = {}) {
  const key = normalizeKey(licenseKey);
  if (!key || key.length < 8) {
    return { ok: false, error: "Licenca e pavlefshme", code: "invalid_license" };
  }

  const fetched = await fetchLicense(key);
  if (!fetched.ok) return fetched;
  const license = fetched.license;

  for (const check of [
    () => checkExpiry(license),
    () => checkNui(license, nui),
    () => checkDevice(license, deviceId),
    () => checkScanLimit(license),
  ]) {
    const r = check();
    if (!r.ok) return r;
  }

  const limit = checkScanLimit(license);
  return {
    ok: true,
    message: license.business_name ? `Licenca aktive — ${license.business_name}` : "Licenca aktive",
    business_name: license.business_name || businessName,
    expires_at: license.expires_at,
    scans_remaining: limit.scans_remaining,
    activated: !!license.device_id,
  };
}

async function incrementScanCount(licenseId) {
  const { data } = await table().select("scans_used").eq("id", licenseId).maybeSingle();
  const next = Number(data?.scans_used || 0) + 1;
  await table()
    .update({ scans_used: next, last_scan_at: new Date().toISOString() })
    .eq("id", licenseId);
  return next;
}

module.exports = {
  normalizeKey,
  normalizeDeviceId,
  activateLicense,
  validateLicense,
  incrementScanCount,
  fetchLicense,
};
