const { createClient } = require("@supabase/supabase-js");

const TABLE = process.env.SUPABASE_LICENSE_TABLE || "kontabilisti_licenses";

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL dhe SUPABASE_SERVICE_ROLE_KEY duhen vendosur në Railway");
  }
  supabase = createClient(url, key);
  return supabase;
}

function normalizeKey(k) {
  return String(k || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function checkLicense(licenseKey, { nui, businessName } = {}) {
  const key = normalizeKey(licenseKey);
  if (!key || key.length < 8) {
    return { ok: false, error: "Licenca e pavlefshme", code: "invalid_license" };
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("license_key", key)
    .maybeSingle();

  if (error) {
    console.error("[license] supabase error", error.message);
    return { ok: false, error: "Gabim verifikimi licence", code: "license_db_error" };
  }
  if (!data || data.active === false) {
    return { ok: false, error: "Licenca e pavlefshme ose e çaktivizuar", code: "invalid_license" };
  }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { ok: false, error: "Licenca ka skaduar — kontaktoni Revolution", code: "license_expired" };
  }
  const limit = Number(data.scans_limit);
  const used = Number(data.scans_used || 0);
  if (limit > 0 && used >= limit) {
    return { ok: false, error: "Limiti i skanimeve AI u arrit", code: "scan_limit" };
  }
  if (data.nui && nui) {
    const a = String(data.nui).replace(/\D/g, "");
    const b = String(nui).replace(/\D/g, "");
    if (a && b && a !== b) {
      return { ok: false, error: "Licenca nuk i përket këtij biznesi (NUI)", code: "nui_mismatch" };
    }
  }

  return {
    ok: true,
    license: data,
    message: data.business_name || businessName || "Licenca aktive",
    scans_remaining: limit > 0 ? Math.max(0, limit - used) : null,
  };
}

async function incrementScanCount(licenseId) {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("scans_used").eq("id", licenseId).maybeSingle();
  const next = Number(data?.scans_used || 0) + 1;
  await sb.from(TABLE).update({ scans_used: next, last_scan_at: new Date().toISOString() }).eq("id", licenseId);
  return next;
}

module.exports = { checkLicense, incrementScanCount, normalizeKey };
