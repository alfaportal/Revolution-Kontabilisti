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

async function findById(id) {
  const lid = String(id || "").trim();
  if (!lid) return null;
  if (useMock()) return mock.licenses.find((l) => String(l.id) === lid) || null;
  const { data } = await getClient().from("licenses").select("*").eq("id", lid).maybeSingle();
  return data;
}

function mapAdminStatus(statusi) {
  const s = String(statusi || "").toLowerCase();
  if (["aktive", "active", "aktiv"].includes(s)) return "active";
  if (["revokuar", "revoked"].includes(s)) return "suspended";
  if (["pezulluar", "suspended"].includes(s)) return "suspended";
  if (["skaduar", "expired"].includes(s)) return "expired";
  return s || "active";
}

async function updateLicenseById(id, patch = {}) {
  const lic = await findById(id);
  if (!lic) throw new Error("Licenca nuk u gjet");
  const row = {};
  if (patch.business_name != null || patch.emri != null) {
    row.business_name = String(patch.business_name || patch.emri || "").trim() || null;
  }
  if (patch.owner_name != null) row.owner_name = String(patch.owner_name || "").trim() || null;
  if (patch.phone != null || patch.telefoni != null) {
    row.phone = String(patch.phone || patch.telefoni || "").trim() || null;
  }
  if (patch.device_id != null || patch.hardware_id != null) {
    const dev = normalizeDeviceId(patch.device_id || patch.hardware_id);
    if (!dev || !isValidDeviceId(dev)) throw new Error("device_id i pavlefshëm");
    row.device_id = dev;
  }
  if (patch.status != null || patch.statusi != null) row.status = mapAdminStatus(patch.statusi || patch.status);
  if (patch.expires_at != null || patch.data_skadimit != null) {
    const raw = patch.expires_at || patch.data_skadimit;
    row.expires_at = raw ? String(raw).slice(0, 10) + "T23:59:59.999Z" : null;
  }
  if (!Object.keys(row).length) throw new Error("Nuk ka fusha për përditësim");

  if (useMock()) {
    Object.assign(lic, row);
    return { ...lic };
  }
  const { data, error } = await getClient().from("licenses").update(row).eq("id", id).select("*").single();
  if (error) throw error;
  return { ...data, license_key: data.license_key || data.id };
}

async function rotateLicenseKeyById(id) {
  const lic = await findById(id);
  if (!lic) throw new Error("Licenca nuk u gjet");
  const newId = uuidV4();
  const row = {
    device_id: lic.device_id,
    business_name: lic.business_name,
    owner_name: lic.owner_name,
    phone: lic.phone,
    nui: lic.nui,
    plan: lic.plan || "standard",
    status: lic.status === "expired" ? "active" : lic.status || "active",
    scans_used: lic.scans_used || 0,
    scans_limit: lic.scans_limit,
    expires_at: lic.expires_at,
    notes: lic.notes,
  };

  if (useMock()) {
    const idx = mock.licenses.findIndex((l) => String(l.id) === String(id));
    if (idx >= 0) mock.licenses.splice(idx, 1);
    const next = { ...row, id: newId, license_key: newId };
    mock.licenses.push(next);
    return next;
  }

  const client = getClient();
  const { error: delErr } = await client.from("licenses").delete().eq("id", id);
  if (delErr) throw delErr;
  const { data, error } = await client
    .from("licenses")
    .insert({ ...row, id: newId })
    .select("*")
    .single();
  if (error) throw error;
  try {
    await client.from("scan_logs").update({ license_id: newId }).eq("license_id", id);
  } catch {
    /* scan_logs opsionale */
  }
  return { ...data, license_key: data.license_key || data.id, rotated_from: id };
}

async function extendLicenseById(id, months = 12) {
  const lic = await findById(id);
  if (!lic) throw new Error("Licenca nuk u gjet");
  const base =
    lic.expires_at && new Date(lic.expires_at) > new Date() ? new Date(lic.expires_at) : new Date();
  return updateLicenseById(id, {
    expires_at: addMonths(base, months),
    statusi: "active",
  });
}

async function deleteLicenseById(id) {
  const lic = await findById(id);
  if (!lic) throw new Error("Licenca nuk u gjet");
  if (useMock()) {
    mock.licenses = mock.licenses.filter((l) => String(l.id) !== String(id));
    return { ok: true, id };
  }
  await getClient().from("scan_logs").delete().eq("license_id", id).catch(() => {});
  const { error } = await getClient().from("licenses").delete().eq("id", id);
  if (error) throw error;
  return { ok: true, id };
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
  updateLicenseById,
  rotateLicenseKeyById,
  extendLicenseById,
  deleteLicenseById,
  findById,
  listAllLicenses,
  getDashboardStats,
  findByDevice,
};
