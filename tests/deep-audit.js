/**
 * Audit i thellë — pastron DB reale, regjistron të dhëna testuese, raporton modulet 1–8
 * Përdor të njëjtin API si UI (Express server lokal)
 */
const path = require("path");
const http = require("http");
const { DB_PATH } = require("../data-paths");

const FROM = "2026-08-01";
const TO = "2026-08-31";
let BASE = "";
let stopServer = null;

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(u, {
      method,
      headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(buf || "{}") }); }
        catch { resolve({ status: res.statusCode, raw: buf }); }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function round2(n) { return Math.round(Number(n) * 100) / 100; }
function near(a, b, tol = 0.02) { return Math.abs(round2(a) - round2(b)) <= tol; }

async function cleanDb() {
  const { initDatabase, getDb } = require("../database");
  await initDatabase();
  const db = getDb();
  const tables = [
    "sales_invoice_items",
    "sales_invoices",
    "purchase_invoice_items",
    "purchase_invoices",
    "z_reports",
    "expenses",
    "vat_declarations",
    "declaration_deadlines",
  ];
  const before = {};
  for (const t of tables) {
    try { before[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c; } catch { before[t] = "N/A"; }
  }
  const keep = {
    settings: db.prepare("SELECT COUNT(*) as c FROM settings").get().c,
    clients: db.prepare("SELECT COUNT(*) as c FROM clients").get().c,
  };
  db.exec("DELETE FROM sales_invoice_items");
  db.exec("DELETE FROM sales_invoices");
  db.exec("DELETE FROM purchase_invoice_items");
  db.exec("DELETE FROM purchase_invoices");
  db.exec("DELETE FROM z_reports");
  db.exec("DELETE FROM expenses");
  db.exec("DELETE FROM vat_declarations");
  db.exec("DELETE FROM declaration_deadlines");
  const { syncDeadlines } = require("../declaration-deadlines");
  syncDeadlines(db, db.prepare("SELECT * FROM settings WHERE id=1").get());
  const after = {};
  for (const t of tables) {
    after[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  }
  return { dbPath: DB_PATH, before, after, keep };
}

async function seedData() {
  const log = [];

  for (const z of [
    { report_date: "2026-08-01", report_number: "Z-0801", sales_18_total: 1180, sales_8_total: 540, sales_0_total: 200 },
    { report_date: "2026-08-02", report_number: "Z-0802", sales_18_total: 590, sales_8_total: 0, sales_0_total: 0 },
    { report_date: "2026-08-03", report_number: "Z-0803", sales_18_total: 0, sales_8_total: 324, sales_0_total: 150 },
  ]) {
    const r = await req("POST", "/z-reports", z);
    log.push({ type: "Z", date: z.report_date, ok: r.ok !== false, total: r.computed?.grand_total });
  }

  const b2b1 = await req("POST", "/sales-invoices", {
    invoice_date: "2026-08-04",
    client_name: "ABC SH.P.K.",
    client_nui: "123456789",
    client_fiscal: "123456789",
    client_address: "Rr. ABC 1, Prishtinë",
    payment_method: "transfer",
    status: "finalized",
    items: [
      { description: "Produkt A", quantity: 10, unit_price: 25, vat_rate: 18, unit: "copë" },
      { description: "Produkt B", quantity: 5, unit_price: 30, vat_rate: 18, unit: "copë" },
    ],
  });
  log.push({ type: "B2B", date: "2026-08-04", ok: b2b1.ok !== false, id: b2b1.id, grand: b2b1.grand_total });

  const b2b2 = await req("POST", "/sales-invoices", {
    invoice_date: "2026-08-05",
    client_name: "XYZ B.I.",
    client_nui: "987654321",
    client_fiscal: "987654321",
    client_address: "Rr. XYZ 2, Ferizaj",
    payment_method: "cash",
    status: "draft",
    items: [
      { description: "Shërbim", quantity: 1, unit_price: 185.19, vat_rate: 8, unit: "shërbim" },
    ],
  });
  log.push({ type: "B2B-draft", date: "2026-08-05", ok: b2b2.ok !== false, id: b2b2.id, grand: b2b2.grand_total });

  for (const p of [
    {
      supplier_invoice_number: "MEGA-001",
      invoice_date: "2026-08-06",
      supplier_name: "Mega SH.P.K.",
      supplier_nui: "111222333",
      supplier_fiscal: "12345",
      items: [
        { description: "Mall 1", quantity: 20, unit_price_with_vat: 11.8, vat_rate: 18, unit: "copë" },
        { description: "Mall 2", quantity: 30, unit_price_with_vat: 11.8, vat_rate: 18, unit: "copë" },
      ],
    },
    {
      supplier_invoice_number: "DELTA-001",
      invoice_date: "2026-08-07",
      supplier_name: "Delta N.T.P.",
      supplier_nui: "444555666",
      supplier_fiscal: "67890",
      items: [
        { description: "Material", quantity: 50, unit_price_with_vat: 5.4, vat_rate: 8, unit: "copë" },
      ],
    },
  ]) {
    const r = await req("POST", "/purchase-invoices", p);
    log.push({ type: "Blerje", supplier: p.supplier_name, ok: r.ok !== false, grand: r.grand_total });
  }

  for (const e of [
    { expense_date: "2026-08-08", category: "Qira", amount: 500, has_vat: 0, description: "Qira gusht" },
    { expense_date: "2026-08-09", category: "Rryma", amount: 80, has_vat: 1, vat_rate: 18, receipt_number: "F-001" },
    { expense_date: "2026-08-10", category: "Karburant", amount: 120, has_vat: 1, vat_rate: 18, receipt_number: "F-002" },
  ]) {
    const r = await req("POST", "/expenses", e);
    log.push({ type: "Shpenzim", category: e.category, ok: r.ok !== false, amount: e.amount });
  }

  return log;
}

async function runModuleTests() {
  const R = {};

  /* 1 Pasqyra */
  try {
    const dash = await req("GET", "/dashboard");
    const t = dash.totals || {};
    R[1] = {
      ok: true,
      details: {
        salesGross: t.salesGross,
        purchaseGross: t.purchaseGross,
        expenseTotal: t.expenseTotal,
        vatPayable: t.vatPayable,
        netProfit: t.netProfit,
        kpisNonZero: t.salesGross > 0 && t.purchaseGross > 0 && t.expenseTotal > 0,
        missingZDays: dash.missingZDays,
        missingZAlarm: Array.isArray(dash.missingZDays) && dash.missingZDays.length >= 3,
        atkAlerts: (dash.alerts || []).length,
        hasAtkBanner: Array.isArray(dash.alerts),
      },
      issues: [],
    };
    if (!R[1].details.kpisNonZero) R[1].issues.push("KPI-t zero ose mungojnë");
  } catch (e) { R[1] = { ok: false, issues: [e.message] }; }

  /* 2 Shitjet */
  try {
    const z = await req("GET", `/z-reports?from=${FROM}&to=${TO}`);
    const inv = await req("GET", `/sales-invoices?from=${FROM}&to=${TO}`);
    const sumBefore = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals;
    const zCancel = z.rows[0];
    await req("DELETE", `/z-reports/${zCancel.id}`);
    const sumAfter = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals;
    R[2] = {
      ok: true,
      details: {
        zCount: z.rows.length,
        b2bCount: inv.rows.length,
        b2bFinalized: inv.rows.filter((r) => r.status === "finalized").length,
        b2bDraft: inv.rows.filter((r) => r.status === "draft").length,
        zCancelDroppedKpi: sumAfter.salesGross < sumBefore.salesGross,
      },
      issues: [],
    };
    if (z.rows.length !== 3) R[2].issues.push(`Priteshin 3 Z-Raporte, u gjetën ${z.rows.length} (para anulimit)`);
    if (inv.rows.length !== 2) R[2].issues.push(`Priteshin 2 B2B, u gjetën ${inv.rows.length}`);
    if (!R[2].details.zCancelDroppedKpi) R[2].issues.push("Anulimi Z nuk zvogëloi KPI-t");
    if (R[2].issues.length) R[2].ok = false;
  } catch (e) { R[2] = { ok: false, issues: [e.message] }; }

  /* 3 Blerjet */
  try {
    const pur = await req("GET", `/purchase-invoices?from=${FROM}&to=${TO}`);
    const exp = await req("GET", `/expenses?from=${FROM}&to=${TO}`);
    const sumBefore = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals;
    const purDel = pur.rows[0];
    await req("DELETE", `/purchase-invoices/${purDel.id}`);
    const sumAfter = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals;
    const expTotal = exp.rows.reduce((a, r) => a + (r.amount || 0), 0);
    const expVat = exp.rows.reduce((a, r) => a + (r.vat_amount || 0), 0);
    R[3] = {
      ok: true,
      details: {
        purchaseCount: pur.rows.length,
        expenseCount: exp.rows.length,
        expenseTotal: round2(expTotal),
        expenseVat: round2(expVat),
        inputVat: sumBefore.inputVat,
        purchaseDeleteDroppedKpi: sumAfter.purchaseGross < sumBefore.purchaseGross,
      },
      issues: [],
    };
    if (pur.rows.length !== 2) R[3].issues.push(`Priteshin 2 blerje, u gjetën ${pur.rows.length}`);
    if (exp.rows.length !== 3) R[3].issues.push(`Priteshin 3 shpenzime, u gjetën ${exp.rows.length}`);
    if (!near(expTotal, 700)) R[3].issues.push(`Totali shpenzime pritej ~700, mori ${round2(expTotal)}`);
    if (!near(expVat, 36, 6)) R[3].issues.push(`TVSH shpenzime pritej ~36, mori ${round2(expVat)}`);
    if (!R[3].details.purchaseDeleteDroppedKpi) R[3].issues.push("Soft-delete blerje nuk rifreskoi KPI");
    if (R[3].issues.length) R[3].ok = false;
  } catch (e) { R[3] = { ok: false, issues: [e.message] }; }

  /* 4 Ditari */
  try {
    const all = await req("GET", `/ditari?from=${FROM}&to=${TO}`);
    const filtered = await req("GET", `/ditari?from=2026-08-01&to=2026-08-03`);
    const types = new Set(all.rows.map((r) => r.type));
    const zOnly = filtered.rows.filter((r) => r.type === "Z-Raport");
    R[4] = {
      ok: true,
      details: {
        totalRows: all.rows.length,
        types: [...types],
        filteredZCount: zOnly.length,
      },
      issues: [],
    };
    if (!types.has("Z-Raport") || !types.has("Faturë B2B") || !types.has("Blerje") || !types.has("Shpenzim")) {
      R[4].issues.push(`Mungojnë llojet: ${[...types].join(", ")}`);
    }
    if (zOnly.length !== 2) R[4].issues.push(`Filtri 01–03.08: pritej 2 Z (pas anulimit 1), mori ${zOnly.length}`);
    if (R[4].issues.length) R[4].ok = false;
  } catch (e) { R[4] = { ok: false, issues: [e.message] }; }

  /* 5 Raportet */
  try {
    const z = await req("GET", `/z-reports?from=${FROM}&to=${TO}`);
    const inv = await req("GET", `/sales-invoices?from=${FROM}&to=${TO}&status=finalized`);
    const pur = await req("GET", `/purchase-invoices?from=${FROM}&to=${TO}`);
    const exp = await req("GET", `/expenses?from=${FROM}&to=${TO}`);
    const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`);
    const t = sum.totals;
    const zTot = z.rows.reduce((a, r) => a + r.grand_total, 0);
    const b2bTot = inv.rows.reduce((a, r) => a + r.grand_total, 0);
    R[5] = {
      ok: true,
      details: {
        zSectionCount: z.rows.length,
        b2bSectionCount: inv.rows.length,
        salesCombined: round2(zTot + b2bTot),
        salesGrossKpi: t.salesGross,
        purchaseRows: pur.rows.length,
        expenseRows: exp.rows.length,
        vatPayable: t.vatPayable,
        outputVat: t.outputVat,
        inputVat: t.inputVat,
        vatFormula: round2(t.outputVat - t.inputVat),
        netProfit: t.netProfit,
      },
      issues: [],
    };
    if (!near(R[5].details.vatPayable, R[5].details.vatFormula, 0.05)) {
      R[5].issues.push(`TVSH për pagesë (${t.vatPayable}) ≠ dalje−hyrje (${R[5].details.vatFormula})`);
    }
    if (R[5].issues.length) R[5].ok = false;
  } catch (e) { R[5] = { ok: false, issues: [e.message] }; }

  /* 6 Kontabilisti */
  try {
    const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`);
    const audit = await req("GET", `/kontabilisti/audit?from=${FROM}&to=${TO}`);
    const v = await req("GET", "/vat/period?period_type=monthly&year=2026&period=8");
    const b = v.boxes || {};
    R[6] = {
      ok: true,
      details: {
        kpis: sum.totals,
        boxes: {
          "10a": b["10a"], "10b": b["10b"], "10c": b["10c"], "11": b["11"],
          "12": b["12"], "14": b["14"], "31": b["31"], "43": b["43"], "47": b["47"],
          K1: b.K1, K2: b.K2, "30": b["30"],
        },
        selfCheckPass: v.selfCheck?.passed,
        selfCheckFails: (v.selfCheck?.checks || []).filter((c) => !c.ok).map((c) => c.label || c.id),
        auditWarnings: (audit.warnings || []).length,
      },
      issues: [],
    };
    if (!v.selfCheck?.passed) R[6].issues.push(`Self-check dështoi: ${R[6].details.selfCheckFails.join("; ")}`);
    if (sum.totals.salesGross <= 0) R[6].issues.push("KPI shitje zero");
    if (R[6].issues.length) R[6].ok = false;
  } catch (e) { R[6] = { ok: false, issues: [e.message] }; }

  /* 7 Dërgo në ATK */
  try {
    const v = await req("GET", "/vat/period?period_type=monthly&year=2026&period=8");
    const b = v.boxes || {};
    const copyOne = String(b["10a"]);
    const copyAll = ["10a", "10b", "10c", "11", "12", "14", "30"].map((k) => `[${k}] ${b[k]}`).join("\n");
    R[7] = {
      ok: true,
      details: {
        period: "Gusht 2026",
        boxesMatch: !!b["11"],
        selfCheckPass: v.selfCheck?.passed,
        copySample: copyOne,
        copyAllLines: copyAll.split("\n").length,
        copyAllHasValues: copyAll.includes(String(b["10a"])),
      },
      issues: [],
    };
    if (!v.selfCheck?.passed) R[7].issues.push("Self-check ATK ❌");
    if (!copyOne || copyOne === "undefined") R[7].issues.push("KOPJO kutizë — vlera bosh");
    if (R[7].issues.length) R[7].ok = false;
  } catch (e) { R[7] = { ok: false, issues: [e.message] }; }

  /* 8 Cilësimet */
  try {
    const s = await req("GET", "/settings");
    const lic = await req("GET", "/license/status");
    await req("PUT", "/settings", { notify_banner: 0 });
    const s2 = await req("GET", "/settings");
    await req("PUT", "/settings", { notify_banner: 1 });
    R[8] = {
      ok: true,
      details: {
        settingsComplete: s.complete,
        businessName: s.settings?.business_legal_name,
        notifyToggleWorks: s2.settings?.notify_banner === 0,
        deviceId: lic.device_id,
        licenseActive: lic.active,
      },
      issues: [],
    };
    if (!s.complete) R[8].issues.push("Të dhënat e biznesit jo complete");
    if (!lic.device_id || lic.device_id.length < 8) R[8].issues.push("Device ID mungon");
    if (!R[8].details.notifyToggleWorks) R[8].issues.push("Toggle njoftimesh nuk funksionon");
    if (R[8].issues.length) R[8].ok = false;
  } catch (e) { R[8] = { ok: false, issues: [e.message] }; }

  return R;
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("HAPI 1 — PASTRO DB");
  console.log("═══════════════════════════════════════════");
  const clean = await cleanDb();
  console.log("DB:", clean.dbPath);
  console.log("Para pastrimit:", JSON.stringify(clean.before, null, 2));
  console.log("Pas pastrimit:", JSON.stringify(clean.after, null, 2));
  console.log("Ruajtur — settings:", clean.keep.settings, "clients:", clean.keep.clients);
  console.log("Shënim: journal_entries dhe z_report_items nuk ekzistojnë në skemë.");

  const { startOnPort, stopServer: stop } = require("../server");
  stopServer = stop;
  const srv = await startOnPort(0);
  BASE = `http://127.0.0.1:${srv.address().port}/api`;

  console.log("\n═══════════════════════════════════════════");
  console.log("HAPI 2 — REGJISTRO TË DHËNA (API = i njëjti backend si UI)");
  console.log("═══════════════════════════════════════════");
  const seed = await seedData();
  console.log(JSON.stringify(seed, null, 2));

  console.log("\n═══════════════════════════════════════════");
  console.log("HAPI 3 — TESTO MODULET");
  console.log("═══════════════════════════════════════════");
  const results = await runModuleTests();

  const names = {
    1: "Pasqyra",
    2: "Shitjet",
    3: "Blerjet",
    4: "Ditari",
    5: "Raportet",
    6: "Kontabilisti",
    7: "Dërgo në ATK",
    8: "Cilësimet",
  };

  console.log("\n═══════════════════════════════════════════");
  console.log("HAPI 4 — RAPORTI");
  console.log("═══════════════════════════════════════════");
  for (let i = 1; i <= 8; i++) {
    const r = results[i];
    const icon = r?.ok ? "✅" : "❌";
    console.log(`\n${icon} ${i}. ${names[i]}`);
    if (r?.details) console.log("   Detaje:", JSON.stringify(r.details, null, 2).split("\n").join("\n   "));
    if (r?.issues?.length) r.issues.forEach((x) => console.log("   ⚠", x));
    if (!r) console.log("   ⚠ Nuk u testua");
  }

  if (stopServer) await stopServer();
  const failCount = Object.values(results).filter((r) => !r?.ok).length;
  process.exit(failCount ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  if (stopServer) await stopServer();
  process.exit(1);
});
