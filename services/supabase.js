const { createClient } = require("@supabase/supabase-js");
const { uuidV4 } = require("../utils/hash");
const { normalizeDeviceId, isValidDeviceId } = require("../services/device");

const mock = { licenses: [], scanLogs: [] };
let sb = null;

/** Node 20: Realtime kërkon WebSocket — vendose global + transport (supabase-js 2.112+). */
function loadWsTransport() {
  try {
    return require("ws");
  } catch {
    return null;
  }
}

function ensureNodeWebSocket() {
  if (typeof globalThis.WebSocket !== "undefined") return loadWsTransport();
  const ws = loadWsTransport();
  if (ws) globalThis.WebSocket = ws;
  return ws;
}

function supabaseClientOptions() {
  const wsTransport = ensureNodeWebSocket();
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  if (wsTransport) opts.realtime = { transport: wsTransport };
  return opts;
}

function useMock() {
  return !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function getClient() {
  if (useMock()) return null;
  if (!sb) {
    sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseClientOptions(),
    );
  }
  return sb;
}

function addMonths(d, months) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x.toISOString();
}

function dateOnly(iso) {
  return String(iso || "").slice(0, 10);
}

const { planDefaults } = require("./supabase-plans");

async function findByDevice(deviceId) {
  const dev = normalizeDeviceId(deviceId);
  if (useMock()) return mock.licenses.find((l) => normalizeDeviceId(l.device_id) === dev) || null;
  const { data } = await getClient().from("licenses").select("*").eq("device_id", dev).maybeSingle();
  return data;
}

async function checkByDevice(deviceId) {
  const lic = await findByDevice(deviceId);
  if (!lic) return { valid: false, status: "not_found" };

  if (lic.status !== "active") {
    return { valid: false, status: lic.status || "suspended", business_name: lic.business_name };
  }
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
    return { valid: false, status: "expired", business_name: lic.business_name };
  }

  const limit = Number(lic.scans_limit || 0);
  const used = Number(lic.scans_used || 0);
  const remaining = limit > 0 ? Math.max(0, limit - used) : null;

  const patch = { last_check_at: new Date().toISOString() };
  if (useMock()) Object.assign(lic, patch);
  else await getClient().from("licenses").update(patch).eq("device_id", normalizeDeviceId(deviceId));

  return {
    valid: true,
    status: "active",
    business_name: lic.business_name,
    owner_name: lic.owner_name,
    phone: lic.phone,
    nui: lic.nui,
    expires_at: dateOnly(lic.expires_at),
    scans_used: used,
    scans_limit: limit,
    scans_remaining: remaining,
    plan: lic.plan || "standard",
  };
}

/** Verifikon çelësin dhe refreskon licencën për këtë pajisje (pas aktivizimit nga admini). */
async function activateByDevice(deviceId, licenseKey, email) {
  const dev = normalizeDeviceId(deviceId);
  const key = String(licenseKey || "").trim();
  const lic = await findByDevice(dev);

  if (!lic) {
    return { valid: false, status: "not_found", message: "Licenca nuk është regjistruar ende për këtë ID pajisje." };
  }

  const storedKey = String(lic.license_key || lic.id || "").trim();
  if (storedKey && key && storedKey !== key) {
    return { valid: false, status: "invalid_key", message: "Çelësi i licencës nuk përputhet." };
  }

  const patch = { last_check_at: new Date().toISOString() };
  if (email) patch.owner_email = String(email).trim().toLowerCase();

  if (useMock()) Object.assign(lic, patch);
  else await getClient().from("licenses").update(patch).eq("device_id", dev);

  return checkByDevice(deviceId);
}

async function validateForScan(deviceId) {
  const check = await checkByDevice(deviceId);
  if (!check.valid) {
    const code = check.status === "not_found" ? "LICENSE_INVALID" : check.status === "scans_exhausted" ? "SCANS_EXHAUSTED" : "LICENSE_INVALID";
    return { ok: false, code, message: check.status === "not_found" ? "Licenca nuk është aktive" : check.message || "Licenca nuk është aktive", check };
  }
  if (check.scans_remaining === 0) {
    return { ok: false, code: "SCANS_EXHAUSTED", message: "Keni përdorur krejt skanimet. Kontaktoni për rinovim." };
  }
  return { ok: true, check };
}

async function incrementScanByDevice(deviceId, logMeta = {}) {
  const lic = await findByDevice(deviceId);
  if (!lic) throw new Error("License not found");
  const used = Number(lic.scans_used || 0) + 1;
  const dev = normalizeDeviceId(deviceId);

  if (useMock()) {
    lic.scans_used = used;
    lic.last_scan_at = new Date().toISOString();
    mock.scanLogs.push({
      id: uuidV4(),
      license_id: lic.id,
      scanned_at: lic.last_scan_at,
      success: logMeta.success !== false,
      supplier_name: logMeta.supplier_name || null,
      invoice_total: logMeta.invoice_total || null,
    });
  } else {
    await getClient().from("licenses").update({ scans_used: used, last_scan_at: new Date().toISOString() }).eq("device_id", dev);
    await getClient().from("scan_logs").insert({
      license_id: lic.id,
      success: logMeta.success !== false,
      supplier_name: logMeta.supplier_name || null,
      invoice_total: logMeta.invoice_total || null,
    });
  }
  const limit = Number(lic.scans_limit || 0);
  return { scans_used: used, scans_remaining: limit > 0 ? Math.max(0, limit - used) : null };
}

async function createLicense(body) {
  const dev = normalizeDeviceId(body.device_id);
  if (!dev || !isValidDeviceId(dev)) throw new Error("device_id i pavlefshëm");

  const existing = await findByDevice(dev);
  if (existing) throw new Error("Ky Device ID ka licencë — përditëso ose çaktivizo");

  const plan = body.plan || "standard";
  const defs = planDefaults(plan);
  const months = Number(body.duration_months) || defs.months;
  const licenseKey = uuidV4();
  const expires = addMonths(new Date(), months);

  const row = {
    id: uuidV4(),
    device_id: dev,
    business_name: body.business_name || null,
    owner_name: body.owner_name || null,
    phone: body.phone || null,
    nui: body.nui ? String(body.nui).replace(/\D/g, "") : null,
    plan,
    status: "active",
    scans_used: 0,
    scans_limit: Number(body.scans_limit) || defs.scans_limit,
    created_at: new Date().toISOString(),
    expires_at: expires,
    license_key: licenseKey,
  };

  if (useMock()) {
    mock.licenses.push(row);
    return row;
  }
  const { data, error } = await getClient().from("licenses").insert({
    device_id: dev,
    business_name: row.business_name,
    owner_name: row.owner_name,
    phone: row.phone,
    nui: row.nui,
    plan: row.plan,
    status: "active",
    scans_used: 0,
    scans_limit: row.scans_limit,
    expires_at: expires,
    notes: body.notes || null,
  }).select("*").single();
  if (error) throw error;
  return { ...data, license_key: licenseKey };
}

async function updateLicenseByDevice(deviceId, action, value) {
  const lic = await findByDevice(deviceId);
  if (!lic) return { ok: false, error: "Licenca nuk u gjet" };
  const dev = normalizeDeviceId(deviceId);
  const patch = {};

  if (action === "activate") patch.status = "active";
  else if (action === "deactivate") patch.status = "suspended";
  else if (action === "renew") patch.expires_at = addMonths(new Date(), 12);
  else if (action === "add_scans") patch.scans_limit = Number(lic.scans_limit || 0) + Number(value || 0);
  else return { ok: false, error: "Veprim i panjohur" };

  if (useMock()) Object.assign(lic, patch);
  else await getClient().from("licenses").update(patch).eq("device_id", dev);
  return { ok: true, license: { ...lic, ...patch } };
}

async function listAllLicenses() {
  if (useMock()) return [...mock.licenses];
  const { data } = await getClient().from("licenses").select("*").order("created_at", { ascending: false });
  return data || [];
}

async function getDashboardStats() {
  const licenses = await listAllLicenses();
  const active = licenses.filter((l) => l.status === "active").length;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  let scansToday = 0;
  let scansMonth = 0;
  const logs = useMock() ? mock.scanLogs : [];
  if (useMock()) {
    for (const log of logs) {
      const d = String(log.scanned_at || "").slice(0, 10);
      if (d === today) scansToday++;
      if (d.startsWith(month)) scansMonth++;
    }
  } else {
    const { count: cToday } = await getClient().from("scan_logs").select("*", { count: "exact", head: true })
      .gte("scanned_at", `${today}T00:00:00Z`);
    const { count: cMonth } = await getClient().from("scan_logs").select("*", { count: "exact", head: true })
      .gte("scanned_at", `${month}-01T00:00:00Z`);
    scansToday = cToday || 0;
    scansMonth = cMonth || 0;
  }

  return {
    active_licenses: active,
    total_licenses: licenses.length,
    scans_today: scansToday,
    scans_month: scansMonth,
  };
}

module.exports = {
  useMock,
  checkByDevice,
  activateByDevice,
  validateForScan,
  incrementScanByDevice,
  createLicense,
  updateLicenseByDevice,
  listAllLicenses,
  getDashboardStats,
  findByDevice,
};
