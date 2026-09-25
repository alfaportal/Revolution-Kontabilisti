/**
 * Pastron DB reale, regjistron të dhëna Gusht 2026, verifikon llogaritjet në të gjitha modulet
 */
const path = require("path");
const http = require("http");
const { DB_PATH } = require("../data-paths");
const { vatFromGross, vatFromNet, computePeriodTotals, computeAtkBoxes, selfCheck } = require("../vat-engine");

const FROM = "2026-08-01";
const TO = "2026-08-31";
let BASE = "";
let stopServer = null;

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + urlPath, {
      method,
      headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(buf || "{}")); }
        catch { resolve({ raw: buf }); }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function r2(n) { return Math.round(Number(n) * 100) / 100; }
function eq(a, b) { return r2(a) === r2(b); }
function fmt(n) { return "€" + r2(n).toFixed(2); }

async function cleanDb() {
  const { initDatabase, getDb } = require("../database");
  await initDatabase();
  const db = getDb();
  const tables = [
    "z_report_items", "z_reports",
    "sales_invoice_items", "sales_invoices",
    "purchase_invoice_items", "purchase_invoices",
    "expenses", "vat_declarations",
  ];
  const before = {};
  for (const t of tables) {
    try { before[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c; }
    catch { before[t] = "N/A (nuk ekziston)"; }
  }
  const keep = {
    settings: db.prepare("SELECT COUNT(*) as c FROM settings").get().c,
    clients: db.prepare("SELECT COUNT(*) as c FROM clients").get().c,
  };
  for (const sql of [
    "DELETE FROM sales_invoice_items",
    "DELETE FROM sales_invoices",
    "DELETE FROM purchase_invoice_items",
    "DELETE FROM purchase_invoices",
    "DELETE FROM z_reports",
    "DELETE FROM expenses",
    "DELETE FROM vat_declarations",
  ]) db.exec(sql);
  try { db.exec("DELETE FROM z_report_items"); } catch { /* skema pa z_report_items */ }
  const after = {};
  for (const t of ["z_reports", "sales_invoices", "purchase_invoices", "expenses", "vat_declarations"]) {
    after[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  }
  return { dbPath: DB_PATH, before, after, keep };
}

const SEED = {
  zReports: [
    { report_date: "2026-08-01", sales_18_total: 3540, sales_8_total: 864, sales_0_total: 350 },
    { report_date: "2026-08-02", sales_18_total: 1770, sales_8_total: 0, sales_0_total: 0 },
    { report_date: "2026-08-04", sales_18_total: 0, sales_8_total: 432, sales_0_total: 280 },
  ],
  b2b: [
    {
      invoice_date: "2026-08-05", client_name: "Koha SH.P.K.", client_nui: "222333444",
      client_fiscal: "222333444", client_address: "Rr. Koha 1", payment_method: "transfer", status: "finalized",
      items: [
        { description: "Artikull A", quantity: 1, unit_price: 400, vat_rate: 18, unit: "copë" },
        { description: "Artikull B", quantity: 1, unit_price: 300, vat_rate: 18, unit: "copë" },
      ],
    },
    {
      invoice_date: "2026-08-06", client_name: "Vala B.I.", client_nui: "555666777",
      client_fiscal: "555666777", client_address: "Rr. Vala 2", payment_method: "cash", status: "finalized",
      items: [{ description: "Shërbim", quantity: 1, unit_price: 350, vat_rate: 8, unit: "shërbim" }],
    },
  ],
  purchases: [
    {
      supplier_invoice_number: "EURO-001", invoice_date: "2026-08-07",
      supplier_name: "Euro Supply SH.P.K.", supplier_nui: "333444555", supplier_fiscal: "11111",
      items: [
        { description: "Mall 1", quantity: 10, unit_price_with_vat: 29.50, vat_rate: 18, unit: "copë" },
        { description: "Mall 2", quantity: 5, unit_price_with_vat: 59, vat_rate: 18, unit: "copë" },
        { description: "Mall 3", quantity: 1, unit_price_with_vat: 310, vat_rate: 18, unit: "copë" },
      ],
    },
    {
      supplier_invoice_number: "BALK-001", invoice_date: "2026-08-08",
      supplier_name: "Balkan Trade N.T.P.", supplier_nui: "666777888", supplier_fiscal: "22222",
      items: [
        { description: "Material A", quantity: 20, unit_price_with_vat: 13.50, vat_rate: 8, unit: "copë" },
        { description: "Material B", quantity: 20, unit_price_with_vat: 13.50, vat_rate: 8, unit: "copë" },
      ],
    },
    {
      supplier_invoice_number: "KOS-001", invoice_date: "2026-08-09",
      supplier_name: "Kosova Parts B.I.", supplier_nui: "999000111", supplier_fiscal: "33333",
      items: [{ description: "Pjesë", quantity: 1, unit_price_with_vat: 236, vat_rate: 18, unit: "copë" }],
    },
  ],
  expenses: [
    { expense_date: "2026-08-10", category: "Qira", amount: 650, has_vat: 0, description: "Qira gusht" },
    { expense_date: "2026-08-11", category: "Rryma", amount: 95, has_vat: 1, vat_rate: 18, receipt_number: "EL-2026-01" },
    { expense_date: "2026-08-12", category: "Karburant", amount: 142, has_vat: 1, vat_rate: 18, receipt_number: "KR-2026-01" },
    { expense_date: "2026-08-13", category: "Paga", amount: 1200, has_vat: 0, description: "Pagat gusht" },
  ],
};

function computeExpectedManual() {
  const z = SEED.zReports.map((z) => ({
    s18: vatFromGross(z.sales_18_total, 18),
    s8: vatFromGross(z.sales_8_total, 8),
    s0: vatFromGross(z.sales_0_total, 0),
  }));
  const zBase18 = r2(z.reduce((s, x) => s + x.s18.base, 0));
  const zBase8 = r2(z.reduce((s, x) => s + x.s8.base, 0));
  const zBase0 = r2(z.reduce((s, x) => s + x.s0.base, 0));
  const zGross = r2(z.reduce((s, x) => s + x.s18.gross + x.s8.gross + x.s0.gross, 0));

  const b2bNet18 = 400 + 300;
  const b2bNet8 = 350;
  const b2bVat18 = vatFromNet(b2bNet18, 18).vat;
  const b2bVat8 = vatFromNet(b2bNet8, 8).vat;
  const b2bGross = r2(b2bNet18 + b2bVat18 + b2bNet8 + b2bVat8);

  const salesBase18 = r2(zBase18 + b2bNet18);
  const salesBase8 = r2(zBase8 + b2bNet8);
  const salesVat0Base = zBase0;
  const salesBase = r2(salesBase18 + salesBase8 + salesVat0Base);
  const salesGross = r2(zGross + b2bGross);
  const outputVat = r2(z.reduce((s, x) => s + x.s18.vat + x.s8.vat, 0) + b2bVat18 + b2bVat8);

  const purchGross = [900, 540, 236];
  const purch18 = vatFromGross(900, 18);
  const purch8 = vatFromGross(540, 8);
  const purch18b = vatFromGross(236, 18);
  const purchaseInvoiceBase = r2(purch18.base + purch8.base + purch18b.base);
  const purchaseGross = r2(purchGross.reduce((a, b) => a + b, 0));
  const inputVatPurch = r2(purch18.vat + purch8.vat + purch18b.vat);

  const expQira = { base: 650, vat: 0 };
  const expRryma = vatFromGross(95, 18);
  const expKarbur = vatFromGross(142, 18);
  const expPaga = { base: 1200, vat: 0 };
  const expenseTotal = r2(650 + 95 + 142 + 1200);
  const expenseVat = r2(expRryma.vat + expKarbur.vat);
  const expenseBase = r2(expenseTotal - expenseVat);
  const inputVatExp = expenseVat;
  const inputVat = r2(inputVatPurch + inputVatExp);

  const grossProfit = r2(salesBase - purchaseInvoiceBase);
  const netProfit = r2(grossProfit - expenseBase);
  const priorCredit = 0;
  const vatPayable = r2(outputVat - inputVat - priorCredit);

  const totals = {
    salesGross, purchaseGross, expenseTotal, salesBase, salesBase18, salesBase8, salesVat0Base,
    salesVat18: r2(z.reduce((s, x) => s + x.s18.vat, 0) + b2bVat18),
    salesVat8: r2(z.reduce((s, x) => s + x.s8.vat, 0) + b2bVat8),
    outputVat, purchaseInvoiceBase, purchaseInvoiceBase18: r2(purch18.base + purch18b.base),
    purchaseInvoiceBase8: purch8.base, purchaseBase: r2(purchaseInvoiceBase + expRryma.base + expKarbur.base),
    inputVat, grossProfit, netProfit, vatPayable, priorCredit, expenseBase,
  };
  const boxes = computeAtkBoxes(totals, priorCredit);
  const check = selfCheck(boxes, totals);
  return { totals, boxes, check, steps: { zBase18, zBase8, zBase0, b2bNet18, b2bNet8, purch18, purch8, purch18b, expRryma, expKarbur } };
}

async function seedAll() {
  const log = [];
  for (const z of SEED.zReports) {
    const r = await req("POST", "/z-reports", z);
    log.push({ type: "Z", date: z.report_date, ok: r.ok !== false, num: r.report_number });
  }
  for (const inv of SEED.b2b) {
    const r = await req("POST", "/sales-invoices", inv);
    log.push({ type: "B2B", client: inv.client_name, ok: r.ok !== false, grand: r.grand_total });
  }
  for (const p of SEED.purchases) {
    const r = await req("POST", "/purchase-invoices", p);
    log.push({ type: "Blerje", supplier: p.supplier_name, ok: r.ok !== false });
  }
  for (const e of SEED.expenses) {
    const r = await req("POST", "/expenses", e);
    log.push({ type: "Shpenzim", cat: e.category, ok: r.ok !== false });
  }
  return log;
}

function compare(label, manual, actual, fields) {
  const rows = [];
  let allOk = true;
  for (const f of fields) {
    const ok = eq(manual[f], actual[f]);
    if (!ok) allOk = false;
    rows.push({ field: f, manual: manual[f], actual: actual[f], ok });
  }
  return { label, rows, allOk };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("VERIFIKIM — Gusht 2026");
  console.log("DB:", DB_PATH);
  console.log("═══════════════════════════════════════════════════\n");

  const clean = await cleanDb();
  console.log("HAPI 1 — PASTRO:");
  console.log("  Para:", JSON.stringify(clean.before));
  console.log("  Pas:", JSON.stringify(clean.after));
  console.log("  Ruajtur — settings:", clean.keep.settings, "| clients:", clean.keep.clients);
  const allZero = Object.values(clean.after).every((c) => c === 0);
  console.log("  Databaza e pastër:", allZero ? "✅ PO" : "❌ JO");
  console.log("");

  const { startOnPort, stopServer: stop } = require("../server");
  const srv = await startOnPort(0);
  stopServer = stop;
  BASE = `http://127.0.0.1:${srv.address().port}/api`;

  const seedLog = await seedAll();
  console.log("HAPI 2 — REGJISTRIM:");
  for (const s of seedLog) {
    console.log(`  ${s.type} ${s.date || s.client || s.supplier || s.cat}: ${s.ok ? "✅" : "❌"}`);
  }
  console.log("");

  const expected = computeExpectedManual();
  const t = expected.totals;
  const b = expected.boxes;

  console.log("HAPI 3 — LLOGARITJA MANUALE:");
  console.log(`  Z baza 18%: ${fmt(expected.steps.zBase18)} | 8%: ${fmt(expected.steps.zBase8)} | 0%: ${fmt(expected.steps.zBase0)}`);
  console.log(`  B2B baza 18%: ${fmt(expected.steps.b2bNet18)} | 8%: ${fmt(expected.steps.b2bNet8)}`);
  console.log(`  Shitje baza totale: ${fmt(t.salesBase)} | bruto: ${fmt(t.salesGross)} | TVSH dalje: ${fmt(t.outputVat)}`);
  console.log(`  Blerje baza: ${fmt(t.purchaseInvoiceBase)} | bruto: ${fmt(t.purchaseGross)}`);
  console.log(`  Shpenzime baza: ${fmt(t.expenseBase)} | bruto: ${fmt(t.expenseTotal)} | TVSH hyrje (blerje+shp): ${fmt(t.inputVat)}`);
  console.log(`  Fitimi Bruto = ${fmt(t.salesBase)} − ${fmt(t.purchaseInvoiceBase)} = ${fmt(t.grossProfit)}`);
  console.log(`  Fitimi Neto  = ${fmt(t.grossProfit)} − ${fmt(t.expenseBase)} = ${fmt(t.netProfit)}`);
  console.log(`  TVSH për pagesë = ${fmt(t.outputVat)} − ${fmt(t.inputVat)} = ${fmt(t.vatPayable)}`);
  console.log(`  Kutizat: [10a]=${fmt(b["10a"])} [10b]=${fmt(b["10b"])} [10c]=${fmt(b["10c"])} [11]=${fmt(b["11"])}`);
  console.log(`           [12]=${fmt(b["12"])} [14]=${fmt(b["14"])} [31]=${fmt(b["31"])} [43]=${fmt(b["43"])}`);
  console.log(`           [45]=${fmt(b["45"])} [47]=${fmt(b["47"])} [K1]=${fmt(b.K1)} [K2]=${fmt(b.K2)} [30]=${fmt(b["30"])}`);
  console.log("");

  const [dash, summary, pl, vatPeriod] = await Promise.all([
    req("GET", "/dashboard"),
    req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`),
    req("GET", `/kontabilisti/pl?from=${FROM}&to=${TO}`),
    req("GET", "/vat/period?period_type=monthly&year=2026&period=8"),
  ]);

  const kpiFields = ["salesGross", "purchaseGross", "expenseTotal", "grossProfit", "netProfit", "vatPayable"];
  const modules = [
    compare("Pasqyra (/dashboard YTD)", t, dash.totals, kpiFields),
    compare("Kontabilisti (/summary Gusht)", t, summary.totals, kpiFields),
    compare("Raportet P&L (/kontabilisti/pl)", t, pl, ["grossProfit", "netProfit"]),
    compare("ATK (/vat/period)", t, vatPeriod.totals, kpiFields),
  ];

  const boxFields = ["10a", "10b", "10c", "11", "12", "14", "31", "43", "45", "47", "K1", "K2", "30"];
  const boxCompare = compare("Kutizat ATK", b, summary.boxes, boxFields);

  console.log("VERIFIKIM MODULESH:");
  for (const m of modules) {
    console.log(`\n  ▶ ${m.label}`);
    console.log(`    Llogaritja ime: bruto=${fmt(t.grossProfit)} neto=${fmt(t.netProfit)} TVSH=${fmt(t.vatPayable)}`);
    const act = m.rows[0] ? m.label.includes("P&L") ? pl : (m.label.includes("Pasqyra") ? dash.totals : summary.totals) : {};
    if (m.label.includes("Pasqyra")) console.log(`    Rezultati programi: bruto=${fmt(dash.totals.grossProfit)} neto=${fmt(dash.totals.netProfit)} TVSH=${fmt(dash.totals.vatPayable)}`);
    else if (m.label.includes("Kontabilisti")) console.log(`    Rezultati programi: bruto=${fmt(summary.totals.grossProfit)} neto=${fmt(summary.totals.netProfit)} TVSH=${fmt(summary.totals.vatPayable)}`);
    else if (m.label.includes("P&L")) console.log(`    Rezultati programi: bruto=${fmt(pl.grossProfit)} neto=${fmt(pl.netProfit)}`);
    else console.log(`    Rezultati programi: bruto=${fmt(vatPeriod.totals.grossProfit)} neto=${fmt(vatPeriod.totals.netProfit)} TVSH=${fmt(vatPeriod.totals.vatPayable)}`);
    for (const r of m.rows) {
      console.log(`    ${r.field}: manual=${fmt(r.manual)} program=${fmt(r.actual)} ${r.ok ? "✅" : "❌"}`);
    }
    console.log(`    ${m.allOk ? "✅ PËRPUTHET" : "❌ NUK PËRPUTHET"}`);
  }

  console.log(`\n  ▶ Kutizat ATK (Kontabilisti)`);
  let boxesOk = true;
  for (const r of boxCompare.rows) {
    if (!r.ok) boxesOk = false;
    console.log(`    [${r.field}]: manual=${fmt(r.manual)} program=${fmt(r.actual)} ${r.ok ? "✅" : "❌"}`);
  }
  console.log(`    ${boxesOk ? "✅ PËRPUTHET" : "❌ NUK PËRPUTHET"}`);

  console.log(`\n  ▶ Dërgo në ATK — Self-check Gusht 2026`);
  const sc = vatPeriod.selfCheck || {};
  const auditOk = vatPeriod.audit?.ok !== false;
  console.log(`    Audit OK: ${auditOk ? "✅" : "❌"} | Gabime: ${(vatPeriod.audit?.errors || []).join("; ") || "asnjë"}`);
  console.log(`    Self-check checks: ${(sc.checks || []).filter((c) => c.ok).length}/${(sc.checks || []).length} ✅`);
  for (const c of (sc.checks || [])) {
    console.log(`      ${c.ok ? "✅" : "❌"} ${c.label}`);
  }

  const crossModule = eq(dash.totals.grossProfit, summary.totals.grossProfit)
    && eq(summary.totals.grossProfit, pl.grossProfit)
    && eq(dash.totals.netProfit, summary.totals.netProfit)
    && eq(summary.totals.netProfit, pl.netProfit);
  console.log(`\n  Pasqyra = Kontabilisti = Raportet (fitim): ${crossModule ? "✅ PËRPUTHET" : "❌ NUK PËRPUTHET"}`);

  const allPass = modules.every((m) => m.allOk) && boxesOk && auditOk && crossModule;
  console.log("\n═══════════════════════════════════════════════════");
  console.log(allPass ? "🎉 TË GJITHA VERIFIKIMET KALUAN" : "⚠️ KA GABIME — DUHET RREGULLIM");
  console.log("═══════════════════════════════════════════════════");

  await stopServer();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  if (stopServer) await stopServer();
  process.exit(1);
});
