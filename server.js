const express = require("express");
const path = require("path");
const fs = require("fs");
const {
  getDb, getSettings, updateSettings, settingsComplete,
  nextInvoiceNumber, nextPurchaseNumber, nextExpenseNumber, nextZReportNumber, initDatabase,
  resetDatabaseConnection,
} = require("./database");
const {
  round2, vatFromGross, vatFromNet, computePeriodTotals, computeAtkBoxes, selfCheck, periodBounds,
} = require("./vat-engine");
const { validateSalesInvoice, validatePurchaseInvoice, validateExpense, validateZReport, isValidNui, validateSettingsFields } = require("./validators");
const { runVatAudit } = require("./audit-engine");
const { listDeadlinesWithAlerts, upcomingAlerts, popupAlerts, pendingOpenDeadlines, syncDeadlineStatuses } = require("./declaration-deadlines");
const { createBackup, listBackups, restoreBackup, dbSizeBytes, backupInfo } = require("./data-backup");
const { DATA_DIR, DB_PATH, BACKUP_DIR_APPDATA, LICENSE_PATH, formatDisplayPath } = require("./data-paths");
const { getDatabaseVersion, DB_VERSION } = require("./database");
const { notesForVersion } = require("./app-release-notes");
const {
  checkLicense,
  activateLicenseRemote,
  getDeviceId,
} = require("./license-proxy-client");
const { scanDocumentLocal, testAnthropicApiKey, hasAnthropicApiKey } = require("./ai-scan-proxy");
const { getAiConfigPublic, saveAnthropicApiKey } = require("./ai-config");
const { countScans } = require("./ai-scan-storage");
const { savePurchasePhoto, saveRecordPhoto, resolvePhotoPath } = require("./invoice-photo");

function sendStoredPhoto(res, stored) {
  const full = resolvePhotoPath(stored);
  if (!full) return err(res, "Pa foto", 404);
  return res.sendFile(full);
}

let app = null;
let server = null;

function json(res, data, status = 200) {
  res.status(status).json(data);
}

function err(res, message, status = 400) {
  json(res, { ok: false, error: message }, status);
}

function sanitizeSettings(s) {
  if (!s) return s;
  const out = { ...s };
  out.has_license = s.license_status === "active";
  delete out.license_key_enc;
  delete out.ai_license_key_enc;
  delete out.anthropic_api_key_enc;
  out.has_anthropic_api_key = hasAnthropicApiKey();
  return out;
}

function maskLicenseKeyDisplay(key) {
  const s = String(key || "").trim();
  if (!s) return null;
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}-****-****-${s.slice(-4)}`;
}

function saveLicenseLocal(info) {
  const keyRaw = info.license_key != null ? String(info.license_key).trim() : "";
  const patch = {
    license_device_id: getDeviceId(),
    license_status: info.status || "active",
    license_expires_at: info.expires_at || null,
    license_scans_used: info.scans_used ?? 0,
    license_scans_limit: info.scans_limit ?? 500,
    license_plan: info.plan || "standard",
    license_business_name: info.business_name || null,
    license_key_display: keyRaw ? maskLicenseKeyDisplay(keyRaw) : (info.license_key_display || null),
    license_last_check_at: new Date().toISOString(),
    ai_license_activated: info.status === "active" ? 1 : 0,
  };
  updateSettings(patch);
  try {
    fs.writeFileSync(LICENSE_PATH, JSON.stringify({
      device_id: patch.license_device_id,
      status: patch.license_status,
      expires_at: patch.license_expires_at,
      scans_used: patch.license_scans_used,
      scans_limit: patch.license_scans_limit,
      plan: patch.license_plan,
      business_name: patch.license_business_name,
      saved_at: patch.license_last_check_at,
    }, null, 2));
  } catch { /* ignore */ }
  return patch;
}

async function refreshLicenseIfStale(force = false) {
  const deviceId = getDeviceId();
  const s = getSettings();
  const last = s?.license_last_check_at ? new Date(s.license_last_check_at).getTime() : 0;
  const dayMs = 24 * 60 * 60 * 1000;
  if (!force && last && Date.now() - last < dayMs) {
    return {
      ok: true,
      active: s.license_status === "active",
      cached: true,
      expires_at: s.license_expires_at,
      scans_used: s.license_scans_used,
      scans_limit: s.license_scans_limit,
      plan: s.license_plan,
      business_name: s.license_business_name,
    };
  }
  try {
    const check = await checkLicense(deviceId);
    if (!check.valid) {
      if (s?.license_status === "active") {
        return {
          ok: true,
          active: true,
          offline: true,
          status: check.status || s.license_status,
          expires_at: s.license_expires_at,
          scans_used: s.license_scans_used,
          scans_limit: s.license_scans_limit,
          plan: s.license_plan,
          business_name: s.license_business_name,
        };
      }
      updateSettings({
        license_device_id: deviceId,
        license_status: check.status || "not_found",
        license_last_check_at: new Date().toISOString(),
        ai_license_activated: 0,
      });
      return { ok: true, active: false, status: check.status };
    }
    saveLicenseLocal({
      status: "active",
      expires_at: check.expires_at,
      scans_used: check.scans_used,
      scans_limit: check.scans_limit,
      plan: check.plan,
      business_name: check.business_name,
    });
    return {
      ok: true,
      active: true,
      expires_at: check.expires_at,
      scans_used: check.scans_used,
      scans_limit: check.scans_limit,
      scans_remaining: check.scans_remaining,
      plan: check.plan,
      business_name: check.business_name,
    };
  } catch (e) {
    if (s?.license_status === "active") {
      return { ok: true, active: true, offline: true, expires_at: s.license_expires_at };
    }
    return { ok: false, active: false, error: e.message };
  }
}

function periodTypeFromSettings() {
  return getSettings()?.declaration_period || "quarterly";
}

function upsertClientFromInvoice(db, b) {
  if (!b.client_nui || !b.client_name) return null;
  const row = {
    name: b.client_name,
    nui: String(b.client_nui).replace(/\D/g, ""),
    fiscal_number: b.client_fiscal || "",
    arbk: b.client_arbk || "",
    vat_number: b.client_vat_number || "",
    address: b.client_address || "",
    city: b.client_city || "",
    phone: b.client_phone || "",
    email: b.client_email || "",
    contact_person: b.client_contact || "",
  };
  const existing = db.prepare("SELECT id FROM clients WHERE nui=?").get(row.nui);
  if (existing) {
    db.prepare(`
      UPDATE clients SET name=@name,fiscal_number=@fiscal_number,arbk=@arbk,vat_number=@vat_number,
        address=@address,city=@city,phone=@phone,email=@email,contact_person=@contact_person,
        updated_at=datetime('now') WHERE nui=@nui
    `).run(row);
    return existing.id;
  }
  try {
    const info = db.prepare(`
      INSERT INTO clients (name,nui,fiscal_number,arbk,vat_number,address,city,phone,email,contact_person)
      VALUES (@name,@nui,@fiscal_number,@arbk,@vat_number,@address,@city,@phone,@email,@contact_person)
    `).run(row);
    return info.lastInsertRowid;
  } catch {
    return db.prepare("SELECT id FROM clients WHERE nui=?").get(row.nui)?.id || null;
  }
}

function parseSalesItems(items) {
  let subtotal = 0, vat18 = 0, vat8 = 0, vat0 = 0;
  const parsedItems = (items || []).map((it, i) => {
    let line;
    if (it.unit_price_with_vat != null && it.unit_price_with_vat !== undefined) {
      line = vatFromGross(it.quantity * it.unit_price_with_vat, it.vat_rate);
    } else {
      line = vatFromNet(it.quantity * it.unit_price, it.vat_rate);
    }
    const unitBase = it.quantity ? round2(line.base / it.quantity) : 0;
    if (it.vat_rate === 18) { vat18 += line.vat; subtotal += line.base; }
    else if (it.vat_rate === 8) { vat8 += line.vat; subtotal += line.base; }
    else { vat0 += line.base; subtotal += line.base; }
    return { ...it, item_number: i + 1, unit_price: unitBase, vat_amount: line.vat, total_with_vat: line.gross };
  });
  const vatTotal = round2(vat18 + vat8);
  const grandTotal = round2(subtotal + vatTotal);
  return { parsedItems, subtotal, vat18, vat8, vat0, vatTotal, grandTotal };
}

function buildRoutes() {
  const router = express.Router();

  router.get("/health", (_req, res) => json(res, { ok: true, app: "revolution-kontabilisti" }));

  router.get("/settings", (_req, res) => {
    const s = sanitizeSettings(getSettings());
    json(res, { ok: true, settings: s, complete: settingsComplete(getSettings()) });
  });

  router.put("/settings", async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      delete body.license_key;
      delete body.ai_license_key;
      delete body.anthropic_api_key;
      delete body.license_key_enc;
      delete body.ai_license_key_enc;
      const fieldErrors = validateSettingsFields(body);
      if (fieldErrors.length) return err(res, fieldErrors.join("; "));
      const updated = updateSettings(body);
      const complete = settingsComplete(updated);
      let dataFolder = null;
      if (complete) {
        const { syncBusinessDataFolder } = require("./data-paths");
        const sync = syncBusinessDataFolder(updated);
        dataFolder = {
          folder: sync.folder,
          moved: sync.moved,
          data_dir: sync.to || require("./data-paths").DATA_DIR,
          display_path: formatDisplayPath(sync.to || require("./data-paths").DATA_DIR),
        };
        if (sync.moved) {
          resetDatabaseConnection();
          await initDatabase();
        }
      }
      json(res, {
        ok: true,
        settings: sanitizeSettings(updated),
        complete,
        data_folder: dataFolder,
      });
  } catch (e) {
      err(res, e.message);
    }
  });

  router.get("/license/device-id", (_req, res) => {
    json(res, { ok: true, device_id: getDeviceId() });
  });

  router.get("/license/status", async (_req, res) => {
    const s = getSettings();
    const st = await refreshLicenseIfStale(false);
    json(res, {
      ok: true,
      active: !!st.active,
      has_license: !!st.active,
      status: s?.license_status || (st.active ? "active" : "not_found"),
      expires_at: st.expires_at || s?.license_expires_at,
      scans_used: st.scans_used ?? s?.license_scans_used ?? 0,
      scans_limit: st.scans_limit ?? s?.license_scans_limit ?? 500,
      scans_remaining: st.scans_remaining ?? Math.max(0, (s?.license_scans_limit || 500) - (s?.license_scans_used || 0)),
      plan: st.plan || s?.license_plan || "standard",
      business_name: st.business_name || s?.license_business_name,
      device_id: getDeviceId(),
      offline: !!st.offline,
      license_key_display: s?.license_key_display || null,
    });
  });

  router.post("/license/refresh", async (_req, res) => {
    try {
      const st = await refreshLicenseIfStale(true);
      json(res, { ok: true, ...st });
    } catch (e) {
      err(res, e.message, 502);
    }
  });

  router.post("/license/activate", async (req, res) => {
    try {
      const { email, license_key } = req.body || {};
      const em = String(email || "").trim().toLowerCase();
      const key = String(license_key || "").trim();
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return err(res, "Shkruani email të vlefshëm për regjistrim.");
      }
      if (!key) return err(res, "Shkruani çelësin e licencës.");

      const deviceId = getDeviceId();
      try {
        const remote = await activateLicenseRemote({ license_key: key, device_id: deviceId, email: em });
        if (remote?.valid) {
          saveLicenseLocal({
            status: "active",
            expires_at: remote.expires_at,
            scans_used: remote.scans_used,
            scans_limit: remote.scans_limit,
            plan: remote.plan,
            business_name: remote.business_name,
          });
          return json(res, { ok: true, active: true, ...remote });
        }
      } catch (e) {
        if (e.code !== "network" && e.code !== "timeout") {
          return err(res, e.message || "Çelësi nuk është i vlefshëm.", e.status === 403 ? 403 : 400);
        }
      }

      const st = await refreshLicenseIfStale(true);
      if (!st.active) {
        return json(res, {
          ok: true,
          active: false,
          message: "Licenca nuk është aktivizuar ende. Kontaktoni mbështetjen.",
        });
      }
      json(res, { ok: true, active: true, ...st });
    } catch (e) {
      err(res, e.message, 502);
    }
  });

  async function handleAiScan(req, res, scanTypeOverride) {
    const { imageBase64, mimeType, scan_type } = req.body || {};
    const scanType = scanTypeOverride || scan_type || "purchase";
    if (!imageBase64) return err(res, "Mungon foto e dokumentit");
    if (!mimeType) return err(res, "Mungon lloji i skedarit");
    if (Buffer.byteLength(imageBase64, "base64") > 10 * 1024 * 1024) {
      return err(res, "Skedari tejkalon 10 MB");
    }

    if (!hasAnthropicApiKey()) {
      return err(res, "Vendosni API Key te Cilësimet → AI", 403);
    }

    try {
      const result = await scanDocumentLocal(imageBase64, mimeType, scanType);
      json(res, { ok: true, data: result.data, saved: result.saved });
    } catch (e) {
      const code = e.code || "unknown";
      if (code === "NO_API_KEY") return err(res, e.message, 403);
      if (code === "network" || code === "timeout") return err(res, "Skanimi AI kërkon internet — provo përsëri", 502);
      if (code === "BAD_JSON") return err(res, "⚠️ AI nuk mundi ta lexojë — regjistro manualisht", 422);
      err(res, e.message || "Gabim analize AI", 500);
    }
  }

  router.get("/ai/config", (_req, res) => {
    const cfg = getAiConfigPublic();
    json(res, {
      ok: true,
      has_key: cfg.has_key,
      key_masked: cfg.key_masked,
      source: cfg.source,
      scan_count: countScans(),
    });
  });

  router.put("/ai/config", (req, res) => {
    try {
      const { anthropic_api_key } = req.body || {};
      if (anthropic_api_key === undefined) return err(res, "Mungon anthropic_api_key");
      const result = saveAnthropicApiKey(anthropic_api_key);
      const cfg = getAiConfigPublic();
      json(res, {
        ok: true,
        cleared: !!result.cleared,
        has_key: cfg.has_key,
        key_masked: cfg.key_masked,
        scan_count: countScans(),
      });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.post("/ai/test", async (req, res) => {
    try {
      const { anthropic_api_key } = req.body || {};
      const result = await testAnthropicApiKey(anthropic_api_key);
      json(res, { ok: true, ...result });
    } catch (e) {
      const code = e.code || "unknown";
      if (code === "NO_API_KEY") return err(res, e.message, 403);
      if (code === "INVALID_KEY") return err(res, "API Key nuk është valid", 401);
      if (code === "timeout") return err(res, "❌ Gabim lidhje — provo përsëri", 502);
      err(res, e.message || "Testi dështoi", 500);
    }
  });

  router.post("/ai/scan", (req, res) => handleAiScan(req, res));
  router.post("/ai/analyze-invoice", (req, res) => {
    const st = req.body?.scan_type === "b2b_sales" ? "b2b_sales" : "purchase";
    return handleAiScan(req, res, st);
  });
  router.post("/ai/scan-z-report", (req, res) => handleAiScan(req, res, "z_report"));
  router.post("/ai/scan-b2b-invoice", (req, res) => handleAiScan(req, res, "b2b_sales"));
  router.post("/ai/scan-expense", (req, res) => handleAiScan(req, res, "expense"));
  router.post("/ai/scan-client", (req, res) => handleAiScan(req, res, "client"));
  router.post("/ai/scan-business-cert", (req, res) => handleAiScan(req, res, "business_cert"));

  /* ── Z-Raporte ── */
  router.get("/z-reports", (req, res) => {
    const { from, to } = req.query;
    let sql = "SELECT * FROM z_reports WHERE status='active'";
    const params = [];
    if (from) { sql += " AND report_date >= ?"; params.push(from); }
    if (to) { sql += " AND report_date <= ?"; params.push(to); }
    sql += " ORDER BY report_date DESC";
    json(res, { ok: true, rows: getDb().prepare(sql).all(...params) });
  });

  router.post("/z-reports", (req, res) => {
    const b = req.body || {};
    const val = validateZReport(b);
    if (val.errors.length) return err(res, val.errors.join("; "));

    const existing = getDb().prepare(
      "SELECT id FROM z_reports WHERE report_date = ? AND status='active'"
    ).get(b.report_date);
    if (existing && !b.replace) {
      return res.status(409).json({
        ok: false,
        error: "Kjo datë tashmë ka Z-Raport. Dëshironi ta zëvendësoni?",
        duplicate: true,
        existing_id: existing.id,
      });
    }
    if (existing && b.replace) {
      getDb().prepare("UPDATE z_reports SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(existing.id);
    }

    const s18 = vatFromGross(b.sales_18_total || 0, 18);
    const s8 = vatFromGross(b.sales_8_total || 0, 8);
    const s0 = vatFromGross(b.sales_0_total || 0, 0);
    const grand = round2(s18.gross + s8.gross + s0.gross);

    const reportNumber = nextZReportNumber();

    const info = getDb().prepare(`
      INSERT INTO z_reports (report_date, report_number, device_name,
        sales_18_total, sales_18_base, sales_18_vat,
        sales_8_total, sales_8_base, sales_8_vat,
        sales_0_total, sales_0_vat, grand_total, photo_path)
      VALUES (@report_date, @report_number, @device_name,
        @s18g, @s18b, @s18v, @s8g, @s8b, @s8v, @s0g, 0, @grand, @photo_path)
    `).run({
      report_date: b.report_date,
      report_number: reportNumber,
      device_name: b.device_name || "",
      s18g: s18.gross, s18b: s18.base, s18v: s18.vat,
      s8g: s8.gross, s8b: s8.base, s8v: s8.vat,
      s0g: s0.gross,
      grand,
      photo_path: null,
    });
    let photoPath = b.photo_path || null;
    if (b.photo_attachment?.base64) {
      photoPath = saveRecordPhoto(reportNumber, b.report_date, b.photo_attachment.base64, b.photo_attachment.mimeType || "image/jpeg");
      if (photoPath) {
        getDb().prepare("UPDATE z_reports SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
      }
    } else if (photoPath) {
      getDb().prepare("UPDATE z_reports SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
    }
    json(res, { ok: true, id: info.lastInsertRowid, report_number: reportNumber, photo_path: photoPath, computed: { s18, s8, s0, grand_total: grand } });
  });

  router.get("/z-reports/:id/photo", (req, res) => {
    const row = getDb().prepare("SELECT photo_path FROM z_reports WHERE id=?").get(req.params.id);
    if (!row?.photo_path) return err(res, "Pa foto", 404);
    return sendStoredPhoto(res, row.photo_path);
  });

  router.delete("/z-reports/:id", (req, res) => {
    getDb().prepare("UPDATE z_reports SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    json(res, { ok: true });
  });

  /* ── Klientë ── */
  router.get("/clients", (req, res) => {
    const { nui, q } = req.query;
    if (nui) {
      const row = getDb().prepare("SELECT * FROM clients WHERE nui=?").get(String(nui).replace(/\D/g, ""));
      return json(res, { ok: true, row: row || null });
    }
    if (q) {
      const like = `%${q}%`;
      const rows = getDb().prepare(
        "SELECT * FROM clients WHERE name LIKE ? OR nui LIKE ? ORDER BY name LIMIT 20"
      ).all(like, like);
      return json(res, { ok: true, rows });
    }
    json(res, { ok: true, rows: getDb().prepare("SELECT * FROM clients ORDER BY name").all() });
  });

  router.post("/clients", (req, res) => {
    const b = req.body || {};
    if (!b.name) return err(res, "Emri obligativ");
    const row = {
      name: b.name,
      nui: b.nui ?? null,
      fiscal_number: b.fiscal_number ?? null,
      arbk: b.arbk ?? null,
      vat_number: b.vat_number ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      contact_person: b.contact_person ?? null,
    };
    try {
      const info = getDb().prepare(`
        INSERT INTO clients (name,nui,fiscal_number,arbk,vat_number,address,city,phone,email,contact_person)
        VALUES (@name,@nui,@fiscal_number,@arbk,@vat_number,@address,@city,@phone,@email,@contact_person)
      `).run(row);
      json(res, { ok: true, id: info.lastInsertRowid });
    } catch (e) {
      const msg = (e && e.message) ? String(e.message) : String(e);
      if (/UNIQUE|duplicate|constraint failed/i.test(msg)) {
        return err(res, "Ky NUI ekziston tashmë", 409);
      }
      return err(res, msg || "Gabim ruajtje klienti", 500);
    }
  });

  router.put("/clients/:id", (req, res) => {
    const b = req.body || {};
    getDb().prepare(`
      UPDATE clients SET name=@name,nui=@nui,fiscal_number=@fiscal_number,address=@address,
      city=@city,phone=@phone,email=@email,updated_at=datetime('now') WHERE id=@id
    `).run({ ...b, id: req.params.id });
    json(res, { ok: true });
  });

  router.delete("/clients/:id", (req, res) => {
    getDb().prepare("DELETE FROM clients WHERE id=?").run(req.params.id);
    json(res, { ok: true });
  });

  /* ── Faturat B2B ── */
  router.get("/sales-invoices", (req, res) => {
    const { from, to, status, search, payment_status } = req.query;
    let sql = "SELECT * FROM sales_invoices WHERE status != 'deleted'";
    const params = [];
    if (status) { sql += " AND status = ?"; params.push(status); }
    if (payment_status) { sql += " AND payment_status = ?"; params.push(payment_status); }
    if (from) { sql += " AND invoice_date >= ?"; params.push(from); }
    if (to) { sql += " AND invoice_date <= ?"; params.push(to); }
    if (search) {
      sql += " AND (invoice_number LIKE ? OR client_name LIKE ? OR client_nui LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += " ORDER BY invoice_date DESC, id DESC";
    json(res, { ok: true, rows: getDb().prepare(sql).all(...params) });
  });

  router.get("/sales-invoices/:id", (req, res) => {
    const inv = getDb().prepare("SELECT * FROM sales_invoices WHERE id=?").get(req.params.id);
    if (!inv) return err(res, "Nuk u gjet", 404);
    const items = getDb().prepare("SELECT * FROM sales_invoice_items WHERE invoice_id=? ORDER BY item_number").all(req.params.id);
    json(res, { ok: true, invoice: inv, items });
  });

  router.post("/sales-invoices", (req, res) => {
    const b = req.body || {};
    const items = b.items || [];
    const invoiceNumber = nextInvoiceNumber(b.invoice_date);
    const val = validateSalesInvoice({ ...b, items }, { autoNumber: invoiceNumber });
    if (val.errors.length) return err(res, val.errors.join("; "));
    const { parsedItems, subtotal, vat18, vat8, vat0, vatTotal, grandTotal } = parseSalesItems(items);
    const amountPaid = round2(Number(b.amount_paid) || 0);
    let paymentStatus = b.payment_status || "unpaid";
    if (amountPaid >= grandTotal && grandTotal > 0) paymentStatus = "paid";
    else if (amountPaid > 0) paymentStatus = "partial";

    const db = getDb();
    const tx = db.transaction(() => {
      const clientId = upsertClientFromInvoice(db, b);
      const info = db.prepare(`
        INSERT INTO sales_invoices (invoice_number,invoice_date,due_date,order_number,client_id,client_name,client_nui,
          client_fiscal,client_address,subtotal,vat_18,vat_8,vat_0_base,vat_total,grand_total,
          payment_method,payment_status,amount_paid,notes,payment_terms,status)
        VALUES (@invoice_number,@invoice_date,@due_date,@order_number,@client_id,@client_name,@client_nui,
          @client_fiscal,@client_address,@subtotal,@vat_18,@vat_8,@vat_0_base,@vat_total,@grand_total,
          @payment_method,@payment_status,@amount_paid,@notes,@payment_terms,@status)
      `).run({
        invoice_number: invoiceNumber,
        invoice_date: b.invoice_date,
        due_date: b.due_date || null,
        order_number: b.order_number || "",
        client_id: clientId,
        client_name: b.client_name || "",
        client_nui: b.client_nui || "",
        client_fiscal: b.client_fiscal || "",
        client_address: b.client_address || "",
        subtotal, vat_18: vat18, vat_8: vat8, vat_0_base: vat0, vat_total: vatTotal, grand_total: grandTotal,
        payment_method: b.payment_method || "cash",
        payment_status: paymentStatus,
        amount_paid: amountPaid,
        notes: b.notes || "",
        payment_terms: b.payment_terms || "",
        status: b.status || "draft",
      });
      const ins = db.prepare(`
        INSERT INTO sales_invoice_items (invoice_id,item_number,description,unit,quantity,unit_price,vat_rate,vat_amount,total_with_vat)
        VALUES (@invoice_id,@item_number,@description,@unit,@quantity,@unit_price,@vat_rate,@vat_amount,@total_with_vat)
      `);
      for (const it of parsedItems) ins.run({ ...it, invoice_id: info.lastInsertRowid });
      let photoPath = b.photo_path || null;
      if (b.photo_attachment?.base64) {
        photoPath = saveRecordPhoto(invoiceNumber, b.invoice_date, b.photo_attachment.base64, b.photo_attachment.mimeType || "image/jpeg");
        if (photoPath) {
          db.prepare("UPDATE sales_invoices SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
        }
      } else if (photoPath) {
        db.prepare("UPDATE sales_invoices SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
      }
      return { id: info.lastInsertRowid, invoice_number: invoiceNumber, photo_path: photoPath };
    });
    const result = tx();
    json(res, { ok: true, ...result, warnings: val.warnings });
  });

  router.get("/sales-invoices/:id/photo", (req, res) => {
    const inv = getDb().prepare("SELECT photo_path FROM sales_invoices WHERE id=?").get(req.params.id);
    if (!inv?.photo_path) return err(res, "Pa foto", 404);
    return sendStoredPhoto(res, inv.photo_path);
  });

  router.put("/sales-invoices/:id", (req, res) => {
    const id = Number(req.params.id);
    const inv = getDb().prepare("SELECT * FROM sales_invoices WHERE id=?").get(id);
    if (!inv) return err(res, "Nuk u gjet", 404);
    if (inv.status !== "draft") return err(res, "Vetëm faturat Draft mund të editohen");

    const b = req.body || {};
    const items = b.items || [];
    const val = validateSalesInvoice({ ...b, items, invoice_number: inv.invoice_number }, { autoNumber: inv.invoice_number });
    if (val.errors.length) return err(res, val.errors.join("; "));
    const { parsedItems, subtotal, vat18, vat8, vat0, vatTotal, grandTotal } = parseSalesItems(items);
    const amountPaid = round2(Number(b.amount_paid) || 0);
    let paymentStatus = b.payment_status || "unpaid";
    if (amountPaid >= grandTotal && grandTotal > 0) paymentStatus = "paid";
    else if (amountPaid > 0) paymentStatus = "partial";

    const db = getDb();
    const tx = db.transaction(() => {
      const clientId = upsertClientFromInvoice(db, b);
      db.prepare(`
        UPDATE sales_invoices SET invoice_date=@invoice_date,due_date=@due_date,order_number=@order_number,
          client_id=@client_id,client_name=@client_name,client_nui=@client_nui,client_fiscal=@client_fiscal,
          client_address=@client_address,subtotal=@subtotal,vat_18=@vat_18,vat_8=@vat_8,vat_0_base=@vat_0_base,
          vat_total=@vat_total,grand_total=@grand_total,payment_method=@payment_method,payment_status=@payment_status,
          amount_paid=@amount_paid,notes=@notes,payment_terms=@payment_terms,status=@status,updated_at=datetime('now')
        WHERE id=@id
      `).run({
        id,
        invoice_date: b.invoice_date,
        due_date: b.due_date || null,
        order_number: b.order_number || "",
        client_id: clientId,
        client_name: b.client_name || "",
        client_nui: b.client_nui || "",
        client_fiscal: b.client_fiscal || "",
        client_address: b.client_address || "",
        subtotal, vat_18: vat18, vat_8: vat8, vat_0_base: vat0, vat_total: vatTotal, grand_total: grandTotal,
        payment_method: b.payment_method || "cash",
        payment_status: paymentStatus,
        amount_paid: amountPaid,
        notes: b.notes || "",
        payment_terms: b.payment_terms || "",
        status: b.status || "draft",
      });
      db.prepare("DELETE FROM sales_invoice_items WHERE invoice_id=?").run(id);
      const ins = db.prepare(`
        INSERT INTO sales_invoice_items (invoice_id,item_number,description,unit,quantity,unit_price,vat_rate,vat_amount,total_with_vat)
        VALUES (@invoice_id,@item_number,@description,@unit,@quantity,@unit_price,@vat_rate,@vat_amount,@total_with_vat)
      `);
      for (const it of parsedItems) ins.run({ ...it, invoice_id: id });
    });
    tx();
    if (b.photo_attachment?.base64) {
      const photoPath = saveRecordPhoto(
        inv.invoice_number,
        b.invoice_date,
        b.photo_attachment.base64,
        b.photo_attachment.mimeType || "image/jpeg"
      );
      if (photoPath) {
        getDb().prepare("UPDATE sales_invoices SET photo_path=? WHERE id=?").run(photoPath, id);
      }
    }
    json(res, { ok: true, id, invoice_number: inv.invoice_number });
  });

  router.patch("/sales-invoices/:id/status", (req, res) => {
    const status = req.body?.status;
    if (!status) return err(res, "Statusi mungon");
    const allowed = ["draft", "finalized", "cancelled"];
    if (!allowed.includes(status)) return err(res, "Status i pavlefshëm");
    getDb().prepare("UPDATE sales_invoices SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
    json(res, { ok: true });
  });

  /* ── Blerjet ── */
  function purchasePaidTotal(invoiceId) {
    return round2(Number(getDb().prepare(
      "SELECT COALESCE(SUM(amount),0) as t FROM purchase_payments WHERE purchase_invoice_id=?"
    ).get(invoiceId)?.t || 0));
  }

  function enrichPurchaseRow(row) {
    const paid = purchasePaidTotal(row.id);
    const total = round2(Number(row.grand_total) || 0);
    const debt = round2(Math.max(0, total - paid));
    let payment_status = "unpaid";
    if (total > 0 && debt <= 0.01) payment_status = "paid";
    else if (paid > 0) payment_status = "partial";
    return { ...row, amount_paid: paid, debt, payment_status };
  }

  router.get("/purchase-invoices", (req, res) => {
    const { from, to, search } = req.query;
    let sql = "SELECT * FROM purchase_invoices WHERE status='active'";
    const params = [];
    if (from) { sql += " AND invoice_date >= ?"; params.push(from); }
    if (to) { sql += " AND invoice_date <= ?"; params.push(to); }
    if (search) { sql += " AND (supplier_name LIKE ? OR invoice_number LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
    sql += " ORDER BY invoice_date DESC";
    const rows = getDb().prepare(sql).all(...params).map(enrichPurchaseRow);
    json(res, { ok: true, rows });
  });

  router.get("/purchase-invoices/:id", (req, res) => {
    const inv = getDb().prepare("SELECT * FROM purchase_invoices WHERE id=? AND status='active'").get(req.params.id);
    if (!inv) return err(res, "Fatura nuk u gjet", 404);
    const items = getDb().prepare("SELECT * FROM purchase_invoice_items WHERE invoice_id=? ORDER BY item_number").all(inv.id);
    json(res, { ok: true, invoice: inv, items, has_photo: !!resolvePhotoPath(inv.photo_path) });
  });

  router.get("/purchase-invoices/:id/photo", (req, res) => {
    const inv = getDb().prepare("SELECT photo_path FROM purchase_invoices WHERE id=?").get(req.params.id);
    if (!inv?.photo_path) return err(res, "Pa foto", 404);
    const full = resolvePhotoPath(inv.photo_path);
    if (!full) return err(res, "Skedari i fotos nuk u gjet", 404);
    res.sendFile(full);
  });

  router.post("/purchase-invoices", (req, res) => {
    const b = req.body || {};
    const items = b.items || [];
    const internalNumber = nextPurchaseNumber(b.invoice_date);
    const val = validatePurchaseInvoice(b, { autoNumber: internalNumber });
    if (val.errors.length) return err(res, val.errors.join("; "));
    const vatDeductible = val.vat_deductible ? 1 : 0;
    let subtotal = 0, vat18 = 0, vat8 = 0;

    const parsedItems = items.map((it, i) => {
      const line = vatFromGross(it.quantity * it.unit_price_with_vat, it.vat_rate);
      if (vatDeductible) {
        if (it.vat_rate === 18) vat18 += line.vat;
        else if (it.vat_rate === 8) vat8 += line.vat;
      }
      subtotal += line.base;
      return { ...it, item_number: i + 1, base_price: line.base, vat_amount: vatDeductible ? line.vat : 0, total: line.gross };
    });

    const vatTotal = round2(vat18 + vat8);
    const grandTotal = round2(subtotal + (vatDeductible ? vatTotal : 0));

    const db = getDb();
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO purchase_invoices (invoice_number,internal_number,supplier_invoice_number,invoice_date,supplier_name,supplier_nui,supplier_fiscal,
          subtotal,vat_18,vat_8,vat_total,grand_total,payment_method,vat_deductible,photo_path)
        VALUES (@invoice_number,@internal_number,@supplier_invoice_number,@invoice_date,@supplier_name,@supplier_nui,@supplier_fiscal,
          @subtotal,@vat_18,@vat_8,@vat_total,@grand_total,@payment_method,@vat_deductible,@photo_path)
      `).run({
        invoice_number: val.supplier_invoice_number,
        internal_number: internalNumber,
        supplier_invoice_number: val.supplier_invoice_number,
        invoice_date: b.invoice_date,
        supplier_name: b.supplier_name,
        supplier_nui: b.supplier_nui || "",
        supplier_fiscal: b.supplier_fiscal || "",
        subtotal, vat_18: vat18, vat_8: vat8, vat_total: vatTotal, grand_total: grandTotal,
        payment_method: b.payment_method || "cash",
        vat_deductible: vatDeductible,
        photo_path: null,
      });
      const ins = db.prepare(`
        INSERT INTO purchase_invoice_items (invoice_id,item_number,description,unit,quantity,unit_price_with_vat,vat_rate,base_price,vat_amount,total)
        VALUES (@invoice_id,@item_number,@description,@unit,@quantity,@unit_price_with_vat,@vat_rate,@base_price,@vat_amount,@total)
      `);
      for (const it of parsedItems) ins.run({ ...it, invoice_id: info.lastInsertRowid });

      let photoPath = b.photo_path || null;
      if (b.photo_attachment?.base64) {
        photoPath = savePurchasePhoto(
          internalNumber,
          b.invoice_date,
          b.photo_attachment.base64,
          b.photo_attachment.mimeType || "image/jpeg"
        );
        if (photoPath) {
          db.prepare("UPDATE purchase_invoices SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
        }
      } else if (photoPath) {
        db.prepare("UPDATE purchase_invoices SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
      }

      return { id: info.lastInsertRowid, photo_path: photoPath };
    });
    const result = tx();
    json(res, { ok: true, id: result.id, internal_number: internalNumber, photo_path: result.photo_path, warnings: val.warnings });
  });

  router.delete("/purchase-invoices/:id", (req, res) => {
    getDb().prepare("UPDATE purchase_invoices SET status='deleted', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    json(res, { ok: true });
  });

  router.post("/purchase-payments", (req, res) => {
    const b = req.body || {};
    const invoiceId = Number(b.purchase_invoice_id);
    if (!invoiceId) return err(res, "Fatura e blerjes mungon");
    const amount = round2(Number(b.amount));
    if (!(amount > 0)) return err(res, "Shuma duhet > 0");
    const inv = getDb().prepare(
      "SELECT id, grand_total FROM purchase_invoices WHERE id=? AND status='active'"
    ).get(invoiceId);
    if (!inv) return err(res, "Fatura nuk u gjet", 404);
    const paid = purchasePaidTotal(invoiceId);
    const debt = round2(Math.max(0, Number(inv.grand_total) - paid));
    if (amount > debt + 0.01) return err(res, `Shuma tejkalon borxhin (max ${debt} €)`);
    const info = getDb().prepare(`
      INSERT INTO purchase_payments (purchase_invoice_id, amount, payment_method, payment_date, note)
      VALUES (@purchase_invoice_id, @amount, @payment_method, @payment_date, @note)
    `).run({
      purchase_invoice_id: invoiceId,
      amount,
      payment_method: b.payment_method || "cash",
      payment_date: b.payment_date || new Date().toISOString().slice(0, 10),
      note: b.note || "",
    });
    json(res, { ok: true, id: info.lastInsertRowid, invoice: enrichPurchaseRow(
      getDb().prepare("SELECT * FROM purchase_invoices WHERE id=?").get(invoiceId)
    ) });
  });

  router.get("/purchase-payments", (req, res) => {
    const { invoice_id } = req.query;
    let sql = `SELECT pp.*, pi.internal_number, pi.invoice_number, pi.supplier_name
      FROM purchase_payments pp
      JOIN purchase_invoices pi ON pi.id = pp.purchase_invoice_id
      WHERE pi.status='active'`;
    const params = [];
    if (invoice_id) { sql += " AND pp.purchase_invoice_id=?"; params.push(Number(invoice_id)); }
    sql += " ORDER BY pp.payment_date DESC, pp.id DESC";
    json(res, { ok: true, rows: getDb().prepare(sql).all(...params) });
  });

  /* ── Shpenzimet ── */
  router.get("/expenses", (req, res) => {
    const { from, to } = req.query;
    let sql = "SELECT * FROM expenses WHERE status='active'";
    const params = [];
    if (from) { sql += " AND expense_date >= ?"; params.push(from); }
    if (to) { sql += " AND expense_date <= ?"; params.push(to); }
    sql += " ORDER BY expense_date DESC";
    json(res, { ok: true, rows: getDb().prepare(sql).all(...params) });
  });

  router.post("/expenses", (req, res) => {
    const b = req.body || {};
    const val = validateExpense(b);
    if (val.errors.length) return err(res, val.errors.join("; "));
    const expenseNumber = nextExpenseNumber(b.expense_date);
    let vatAmount = 0;
    if (b.has_vat) {
      const line = vatFromGross(b.amount, b.vat_rate || 18);
      vatAmount = line.vat;
    }
    const info = getDb().prepare(`
      INSERT INTO expenses (expense_number,expense_date,category,description,amount,has_vat,vat_rate,vat_amount,receipt_number,supplier_name,photo_path)
      VALUES (@expense_number,@expense_date,@category,@description,@amount,@has_vat,@vat_rate,@vat_amount,@receipt_number,@supplier_name,@photo_path)
    `).run({
      expense_number: expenseNumber,
      expense_date: b.expense_date,
      category: b.category,
      description: b.description || "",
      amount: b.amount,
      has_vat: b.has_vat ? 1 : 0,
      vat_rate: b.vat_rate || 0,
      vat_amount: vatAmount,
      receipt_number: b.receipt_number || "",
      supplier_name: b.supplier_name || "",
      photo_path: null,
    });
    let photoPath = b.photo_path || null;
    if (b.photo_attachment?.base64) {
      photoPath = saveRecordPhoto(expenseNumber, b.expense_date, b.photo_attachment.base64, b.photo_attachment.mimeType || "image/jpeg");
      if (photoPath) {
        getDb().prepare("UPDATE expenses SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
      }
    } else if (photoPath) {
      getDb().prepare("UPDATE expenses SET photo_path=? WHERE id=?").run(photoPath, info.lastInsertRowid);
    }
    json(res, { ok: true, id: info.lastInsertRowid, expense_number: expenseNumber, photo_path: photoPath, warnings: val.warnings });
  });

  router.get("/expenses/:id/photo", (req, res) => {
    const row = getDb().prepare("SELECT photo_path FROM expenses WHERE id=?").get(req.params.id);
    if (!row?.photo_path) return err(res, "Pa foto", 404);
    return sendStoredPhoto(res, row.photo_path);
  });

  router.delete("/expenses/:id", (req, res) => {
    getDb().prepare("UPDATE expenses SET status='deleted', updated_at=datetime('now') WHERE id=?").run(req.params.id);
    json(res, { ok: true });
  });

  /* ── Dashboard & Raporte ── */
  router.get("/dashboard", (req, res) => {
    const year = new Date().getFullYear();
    const start = `${year}-01-01`;
    const end = new Date().toISOString().slice(0, 10);
    const pt = periodTypeFromSettings();
    const totals = computePeriodTotals(getDb(), start, end, pt);

    const daily = getDb().prepare(`
      SELECT report_date as d, SUM(grand_total) as total FROM z_reports
      WHERE status='active' AND report_date >= date('now','-30 days')
      GROUP BY report_date ORDER BY report_date
    `).all();

    const topClients = getDb().prepare(`
      SELECT client_name, SUM(grand_total) as total FROM sales_invoices
      WHERE status='finalized' GROUP BY client_name ORDER BY total DESC LIMIT 5
    `).all();

    const expensesByCat = getDb().prepare(`
      SELECT category, SUM(amount) as total FROM expenses WHERE status='active'
      GROUP BY category ORDER BY total DESC
    `).all();

    const zDates = new Set(
      getDb().prepare("SELECT report_date FROM z_reports WHERE status='active'").all().map((r) => r.report_date)
    );
    const missingZDays = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (!zDates.has(iso)) missingZDays.push(iso);
    }
    missingZDays.sort();

    json(res, {
      ok: true,
      totals,
      daily,
      topClients,
      expensesByCat,
      missingZDays,
      alerts: upcomingAlerts(getDb(), getSettings()),
      popupAlerts: popupAlerts(getDb(), getSettings()),
      openCount: pendingOpenDeadlines(getDb(), getSettings()).length,
      settings: getSettings(),
    });
  });

  router.get("/ditari", (req, res) => {
    const { from, to, type, search } = req.query;
    const rows = [];

    const dateClause = (col, baseWhere, params) => {
      let w = baseWhere;
      const p = [...params];
      if (from) { w += ` AND ${col} >= ?`; p.push(from); }
      if (to) { w += ` AND ${col} <= ?`; p.push(to); }
      return { w, p };
    };

    if (!type || type === "shitje_z") {
      const { w, p } = dateClause("report_date", " WHERE status='active' ", []);
      getDb().prepare(`SELECT report_date as date, 'Z-Raport' as type, report_number as number, device_name as party, 
        (sales_18_base+sales_8_base+sales_0_total) as net, (sales_18_vat+sales_8_vat) as vat, grand_total as total
        FROM z_reports ${w} ORDER BY report_date DESC`).all(...p).forEach((r) => rows.push(r));
    }
    if (!type || type === "shitje_b2b") {
      const { w, p } = dateClause("invoice_date", " WHERE status='finalized' ", []);
      getDb().prepare(`SELECT invoice_date as date, 'Faturë B2B' as type, invoice_number as number, client_name as party,
        subtotal as net, vat_total as vat, grand_total as total FROM sales_invoices ${w} ORDER BY invoice_date DESC`).all(...p).forEach((r) => rows.push(r));
    }
    if (!type || type === "blerje") {
      const { w, p } = dateClause("invoice_date", " WHERE status='active' ", []);
      getDb().prepare(`SELECT invoice_date as date, 'Blerje' as type, invoice_number as number, supplier_name as party,
        subtotal as net, vat_total as vat, grand_total as total FROM purchase_invoices ${w} ORDER BY invoice_date DESC`).all(...p).forEach((r) => rows.push(r));
    }
    if (!type || type === "shpenzim") {
      const { w, p } = dateClause("expense_date", " WHERE status='active' ", []);
      getDb().prepare(`SELECT expense_date as date, 'Shpenzim' as type, receipt_number as number, COALESCE(supplier_name, category) as party,
        (amount-vat_amount) as net, vat_amount as vat, amount as total FROM expenses ${w} ORDER BY expense_date DESC`).all(...p).forEach((r) => rows.push(r));
    }

    let filtered = rows.sort((a, b) => b.date.localeCompare(a.date));
    if (search) filtered = filtered.filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));

    const sum = filtered.reduce((a, r) => ({ net: a.net + (r.net || 0), vat: a.vat + (r.vat || 0), total: a.total + (r.total || 0) }), { net: 0, vat: 0, total: 0 });
    json(res, { ok: true, rows: filtered, totals: { net: round2(sum.net), vat: round2(sum.vat), total: round2(sum.total) } });
  });

  router.get("/kontabilisti/summary", (req, res) => {
    const settings = getSettings();
    const now = new Date();
    const y = settings?.fiscal_year || now.getFullYear();
    let start = req.query.from;
    let end = req.query.to;
    if (!start || !end) {
      const m = now.getMonth();
      start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const endD = new Date(y, m + 1, 0);
      end = `${y}-${String(m + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
    }
    const pt = periodTypeFromSettings();
    const totals = computePeriodTotals(getDb(), start, end, pt);
    const boxes = computeAtkBoxes(totals);
    const audit = runVatAudit(getDb(), start, end, pt);
    json(res, {
      ok: true,
      totals,
      boxes,
      audit: { ok: audit.ok, errors: audit.errors, warnings: audit.warnings },
      period: { start, end, label: `${start} — ${end}`, periodType: pt },
      settings: settings || {},
    });
  });

  router.get("/kontabilisti/audit", (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return err(res, "from dhe to obligativë");
    const pt = periodTypeFromSettings();
    const audit = runVatAudit(getDb(), from, to, pt);
    json(res, { ok: true, ...audit });
  });

  router.get("/kontabilisti/pl", (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return err(res, "from dhe to obligativë");
    const pt = periodTypeFromSettings();
    const t = computePeriodTotals(getDb(), from, to, pt);
    const byCat = getDb().prepare(
      `SELECT category, SUM(amount) as total FROM expenses WHERE status='active' AND expense_date BETWEEN ? AND ? GROUP BY category ORDER BY category`
    ).all(from, to);
    json(res, {
      ok: true,
      revenue: t.salesBase,
      cogs: t.purchaseInvoiceBase ?? t.purchaseBase,
      grossProfit: t.grossProfit,
      expenses: byCat,
      expenseTotal: t.expenseTotal,
      netProfit: t.netProfit,
    });
  });

  router.get("/vat/period", (req, res) => {
    const { period_type, year, period } = req.query;
    if (!period_type || !year || !period) return err(res, "Parametrat period_type, year, period obligativë");
    const bounds = periodBounds(period_type, year, period);
    const audit = runVatAudit(getDb(), bounds.start, bounds.end, period_type);
    json(res, {
      ok: true,
      bounds,
      totals: audit.totals,
      boxes: audit.boxes,
      selfCheck: audit.selfCheck,
      audit: { ok: audit.ok, errors: audit.errors, warnings: audit.warnings },
    });
  });

  router.get("/vat-declarations", (_req, res) => {
    json(res, { ok: true, rows: getDb().prepare("SELECT * FROM vat_declarations ORDER BY created_at DESC").all() });
  });

  router.post("/vat-declarations", (req, res) => {
    const b = req.body || {};
    const info = getDb().prepare(`
      INSERT INTO vat_declarations (period_type,period_label,period_start,period_end,data_json,status,submitted_date,notes)
      VALUES (@period_type,@period_label,@period_start,@period_end,@data_json,@status,@submitted_date,@notes)
    `).run({
      period_type: b.period_type,
      period_label: b.period_label,
      period_start: b.period_start,
      period_end: b.period_end,
      data_json: JSON.stringify(b.data || {}),
      status: b.status || "draft",
      submitted_date: b.submitted_date || null,
      notes: b.notes || "",
    });
    syncDeadlineStatuses(getDb());
    json(res, { ok: true, id: info.lastInsertRowid });
  });

  router.patch("/vat-declarations/:id", (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = ["draft", "sent", "confirmed"];
    if (!allowed.includes(status)) return err(res, "Status i pavlefshëm (draft/sent/confirmed)");
    const row = getDb().prepare("SELECT id FROM vat_declarations WHERE id=?").get(id);
    if (!row) return err(res, "Deklarata nuk u gjet", 404);
    const submitted = status === "sent" ? new Date().toISOString().slice(0, 10) : null;
    getDb().prepare(`
      UPDATE vat_declarations SET status=@status,
        submitted_date=COALESCE(@submitted_date, submitted_date),
        updated_at=datetime('now') WHERE id=@id
    `).run({ id, status, submitted_date: submitted });
    syncDeadlineStatuses(getDb());
    json(res, { ok: true });
  });

  router.patch("/deadlines/:id", (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = ["pending", "submitted", "confirmed", "overdue"];
    if (!allowed.includes(status)) return err(res, "Status i pavlefshëm");
    const row = getDb().prepare("SELECT id FROM declaration_deadlines WHERE id=?").get(id);
    if (!row) return err(res, "Afati nuk u gjet", 404);
    const submitted = status === "submitted" || status === "confirmed"
      ? new Date().toISOString().slice(0, 10) : null;
    getDb().prepare(`
      UPDATE declaration_deadlines SET status=@status, submitted_date=COALESCE(@submitted_date, submitted_date)
      WHERE id=@id
    `).run({ id, status, submitted_date: submitted });
    json(res, { ok: true });
  });

  router.get("/deadlines", (_req, res) => {
    json(res, { ok: true, rows: listDeadlinesWithAlerts(getDb(), getSettings()) });
  });

  router.get("/next-z-report-number", (_req, res) => {
    json(res, { ok: true, number: nextZReportNumber() });
  });

  router.get("/next-invoice-number", (req, res) => {
    json(res, { ok: true, number: nextInvoiceNumber(req.query.date) });
  });

  router.get("/next-purchase-number", (req, res) => {
    json(res, { ok: true, number: nextPurchaseNumber(req.query.date) });
  });

  router.get("/next-expense-number", (req, res) => {
    json(res, { ok: true, number: nextExpenseNumber(req.query.date) });
  });

  /* ── Backup & Të dhënat ── */
  router.get("/data/info", (_req, res) => {
    try {
      const db = getDb();
      const info = backupInfo(db);
      json(res, {
        ok: true,
        db_path: DB_PATH,
        db_path_display: formatDisplayPath(DB_PATH),
        data_dir: DATA_DIR,
        data_dir_display: formatDisplayPath(DATA_DIR),
        backup_dir_display: formatDisplayPath(BACKUP_DIR_APPDATA),
        db_size_bytes: dbSizeBytes(),
        db_version: getDatabaseVersion(),
        db_version_target: DB_VERSION,
        app_version: require("./package.json").version,
        ...info,
      });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.get("/app/update-notice", (_req, res) => {
    try {
      const pkg = require("./package.json");
      const row = getDb().prepare("SELECT value FROM db_meta WHERE key = 'last_seen_version'").get();
      const lastSeen = row?.value || "";
      json(res, {
        ok: true,
        show: lastSeen !== pkg.version,
        version: pkg.version,
        notes: notesForVersion(pkg.version),
      });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.post("/app/update-notice/dismiss", (_req, res) => {
    try {
      const pkg = require("./package.json");
      getDb().prepare("INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)").run("last_seen_version", pkg.version);
      json(res, { ok: true });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.post("/backup", (_req, res) => {
    try {
      const result = createBackup(getDb(), { manual: true });
      json(res, { ok: true, ...result });
  } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.get("/backup/list", (_req, res) => {
    json(res, { ok: true, rows: listBackups() });
  });

  router.post("/backup/restore", async (req, res) => {
    try {
      const result = restoreBackup(req.body.path);
      await initDatabase();
      json(res, { ok: true, ...result });
  } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.post("/admin/factory-reset", (req, res) => {
    const { validateFactoryResetAuth, executeFactoryReset } = require("./factory-reset");
    const b = req.body || {};
    const auth = validateFactoryResetAuth({ password: b.password, confirmWord: b.confirmWord });
    if (!auth.ok) return err(res, auth.error, auth.error.includes("Fjalëkalimi") ? 403 : 400);
    try {
      const result = executeFactoryReset(getDb);
      json(res, { ok: true, restart: true, logLine: result.logLine });
    } catch (e) {
      err(res, e.message || "Gabim factory reset", 500);
    }
  });

  return router;
}

async function createApp() {
  if (app) return app;
  await initDatabase();
  let baseDir = __dirname;
  try {
    const { app: electronApp } = require("electron");
    if (electronApp?.isPackaged) {
      const unpacked = path.join(process.resourcesPath, "app.asar.unpacked");
      if (fs.existsSync(path.join(unpacked, "public"))) baseDir = unpacked;
    }
  } catch {
    /* standalone node test server */
  }
  const publicDir = path.join(baseDir, "public");
  app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", buildRoutes());
  app.use(express.static(publicDir, {
    setHeaders(res, filePath) {
      if (/\.(html?|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
  return app;
}

function startOnPort(port) {
  return createApp().then((application) => new Promise((resolve, reject) => {
    server = application.listen(port, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  }));
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => { server = null; resolve(); });
  });
}

async function syncLicenseCacheFromCloud(app) {
  try {
    const check = await checkLicense(getDeviceId());
    if (check.valid) {
      saveLicenseLocal({
        status: "active",
        expires_at: check.expires_at,
        scans_used: check.scans_used,
        scans_limit: check.scans_limit,
        plan: check.plan,
        business_name: check.business_name,
      });
      return { ok: true, active: true };
    }
  } catch {
    /* offline — përdor cache cloud nga main process */
  }
  try {
    const cloud = require("./protection/cloud-license");
    if (app) cloud.registerInstallContext(app);
    if (cloud.isLicenseActiveLocally(app)) {
      const rec = cloud.readActivationRecord(app) || {};
      saveLicenseLocal({
        status: "active",
        expires_at: rec.expires_at || null,
        scans_used: 0,
        scans_limit: 500,
        plan: rec.plan || "standard",
        business_name: rec.business_name || null,
        license_key: rec.license_key || null,
      });
      return { ok: true, active: true, offline: true };
    }
  } catch {
    /* ignore */
  }
  return { ok: false, active: false };
}

module.exports = { createApp, startOnPort, stopServer, syncLicenseCacheFromCloud };
