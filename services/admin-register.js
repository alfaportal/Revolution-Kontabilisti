/**
 * Regjistrim klienti + licencë nga Super Admin (telefon) — device_id = Hardware ID desktop.
 */
const { normalizeDeviceId, isValidDeviceId } = require("./device");
const db = require("./supabase");

async function registerClientWithLicense(body = {}) {
  const dev = normalizeDeviceId(body.device_id || body.hardware_id || body.hardwareId);
  if (!dev || !isValidDeviceId(dev)) {
    throw new Error("device_id / hardware_id i pavlefshëm — duhet XXXX-XXXX-XXXX-XXXX");
  }

  const existing = await db.findByDevice(dev);
  if (existing) {
    const licenseKey = String(existing.license_key || existing.id || "").trim();
    return {
      ok: true,
      already_exists: true,
      message: "Tashmë ekziston",
      client: {
        id: existing.id,
        emri: existing.business_name || body.emri || "—",
        email: existing.owner_email || body.email || "",
      },
      license: existing,
      license_key: licenseKey,
      device_id: dev,
      hardware_id: dev,
    };
  }

  const months = Number(body.duration_months || body.muaj || 12);
  const lic = await db.createLicense({
    device_id: dev,
    business_name: String(body.emri || body.business_name || "").trim() || null,
    owner_name: String(body.owner_name || body.owner_emri || "").trim() || null,
    phone: String(body.telefon || body.phone || "").trim() || null,
    nui: body.nui ? String(body.nui).replace(/\D/g, "") : null,
    plan: body.plan || "standard",
    duration_months: [1, 3, 6, 12, 24].includes(months) ? months : 12,
    notes: body.email ? `owner_email:${String(body.email).trim().toLowerCase()}` : null,
  });

  const licenseKey = String(lic.license_key || lic.id || "").trim();
  return {
    ok: true,
    already_exists: false,
    client: {
      id: lic.id,
      emri: lic.business_name || body.emri || "—",
      email: body.email || "",
    },
    license: lic,
    license_key: licenseKey,
    device_id: dev,
    hardware_id: dev,
    expires_at: lic.expires_at || null,
  };
}

module.exports = { registerClientWithLicense };
