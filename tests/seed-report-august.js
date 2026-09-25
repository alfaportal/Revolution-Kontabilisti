/**
 * Pastron DB reale, regjistron transaksione Gusht 2026, raporton vlerat nga modulet
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

function fmt(n) {
  const x = Math.round(Number(n || 0) * 100) / 100;
  return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function euro(n) { return "€" + fmt(n); }

async function cleanDb() {
  const { initDatabase, getDb } = require("../database");
  await initDatabase();
  const db = getDb();
  for (const sql of [
    "DELETE FROM sales_invoice_items",
    "DELETE FROM sales_invoices",
    "DELETE FROM purchase_invoice_items",
    "DELETE FROM purchase_invoices",
    "DELETE FROM z_reports",
    "DELETE FROM expenses",
    "DELETE FROM vat_declarations",
  ]) db.exec(sql);
  try { db.exec("DELETE FROM z_report_items"); } catch { /* */ }
  const counts = {};
  for (const t of ["z_reports", "sales_invoices", "purchase_invoices", "expenses", "vat_declarations", "settings", "clients"]) {
    counts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  }
  return counts;
}

const SEED = {
  zReports: [
    { report_date: "2026-08-01", sales_18_total: 2360, sales_8_total: 756, sales_0_total: 440 },
    { report_date: "2026-08-02", sales_18_total: 4130, sales_8_total: 0, sales_0_total: 0 },
    { report_date: "2026-08-03", sales_18_total: 0, sales_8_total: 1296, sales_0_total: 620 },
    { report_date: "2026-08-05", sales_18_total: 1180, sales_8_total: 378, sales_0_total: 0 },
    { report_date: "2026-08-07", sales_18_total: 826, sales_8_total: 540, sales_0_total: 175 },
  ],
  b2b: [
    {
      invoice_date: "2026-08-04", client_name: "Prishtina Trade SH.P.K.", client_nui: "111222333",
      client_fiscal: "111222333", client_address: "Rr. Nëna Terezë 1, Prishtinë", payment_method: "transfer", status: "finalized",
      items: [
        { description: "Artikull 1", quantity: 1, unit_price: 250, vat_rate: 18, unit: "copë" },
        { description: "Artikull 2", quantity: 1, unit_price: 180, vat_rate: 18, unit: "copë" },
        { description: "Artikull 3", quantity: 1, unit_price: 320, vat_rate: 18, unit: "copë" },
      ],
    },
    {
      invoice_date: "2026-08-06", client_name: "Ferizaj Market B.I.", client_nui: "444555666",
      client_fiscal: "444555666", client_address: "Rr. Deshmoret 5, Ferizaj", payment_method: "cash", status: "finalized",
      items: [
        { description: "Artikull A", quantity: 1, unit_price: 500, vat_rate: 8, unit: "copë" },
        { description: "Artikull B", quantity: 1, unit_price: 275, vat_rate: 8, unit: "copë" },
      ],
    },
    {
      invoice_date: "2026-08-08", client_name: "Mitrovica Supply N.T.P.", client_nui: "777888999",
      client_fiscal: "777888999", client_address: "Rr. e Minatorëve 12, Mitrovicë", payment_method: "transfer", status: "finalized",
      items: [{ description: "Furnizim", quantity: 1, unit_price: 450, vat_rate: 18, unit: "shërbim" }],
    },
  ],
  purchases: [
    {
      supplier_invoice_number: "F-10001", invoice_date: "2026-08-09",
      supplier_name: "Ardi Wholesale SH.P.K.", supplier_nui: "123123123", supplier_fiscal: "F-10001",
      items: [
        { description: "Mall A", quantity: 1, unit_price_with_vat: 472, vat_rate: 18, unit: "copë" },
        { description: "Mall B", quantity: 1, unit_price_with_vat: 354, vat_rate: 18, unit: "copë" },
      ],
    },
    {
      supplier_invoice_number: "F-10002", invoice_date: "2026-08-10",
      supplier_name: "Bekim Import B.I.", supplier_nui: "456456456", supplier_fiscal: "F-10002",
      items: [
        { description: "Mall 1", quantity: 1, unit_price_with_vat: 216, vat_rate: 8, unit: "copë" },
        { description: "Mall 2", quantity: 1, unit_price_with_vat: 162, vat_rate: 8, unit: "copë" },
        { description: "Mall 3", quantity: 1, unit_price_with_vat: 108, vat_rate: 8, unit: "copë" },
      ],
    },
    {
      supplier_invoice_number: "F-10003", invoice_date: "2026-08-11",
      supplier_name: "Driton Parts N.T.P.", supplier_nui: "789789789", supplier_fiscal: "F-10003",
      items: [{ description: "Pjesë", quantity: 1, unit_price_with_vat: 590, vat_rate: 18, unit: "copë" }],
    },
    {
      supplier_invoice_number: "F-10004", invoice_date: "2026-08-12",
      supplier_name: "Egzon Materials SH.P.K.", supplier_nui: "321321321", supplier_fiscal: "F-10004",
      items: [
        { description: "Material 1", quantity: 1, unit_price_with_vat: 270, vat_rate: 8, unit: "copë" },
        { description: "Material 2", quantity: 1, unit_price_with_vat: 135, vat_rate: 8, unit: "copë" },
      ],
    },
  ],
  expenses: [
    { expense_date: "2026-08-13", category: "Qira", amount: 800, has_vat: 0, description: "Qira gusht" },
    { expense_date: "2026-08-14", category: "Rryma", amount: 141.60, has_vat: 1, vat_rate: 18, receipt_number: "EL-08-01" },
    { expense_date: "2026-08-15", category: "Karburant", amount: 212.40, has_vat: 1, vat_rate: 18, receipt_number: "KR-08-01" },
    { expense_date: "2026-08-16", category: "Paga", amount: 2400, has_vat: 0, description: "Pagat gusht" },
    { expense_date: "2026-08-17", category: "Mirëmbajtje", amount: 86.40, has_vat: 1, vat_rate: 8, receipt_number: "MR-08-01" },
  ],
};

async function seedAll() {
  const log = [];
  for (const z of SEED.zReports) {
    const r = await req("POST", "/z-reports", z);
    log.push({ t: "Z", d: z.report_date, ok: r.ok !== false, err: r.error });
  }
  for (const inv of SEED.b2b) {
    const r = await req("POST", "/sales-invoices", inv);
    log.push({ t: "B2B", d: inv.client_name, ok: r.ok !== false, err: r.error });
  }
  for (const p of SEED.purchases) {
    const r = await req("POST", "/purchase-invoices", p);
    log.push({ t: "Blerje", d: p.supplier_name, ok: r.ok !== false, err: r.error });
  }
  for (const e of SEED.expenses) {
    const r = await req("POST", "/expenses", e);
    log.push({ t: "Shpenzim", d: e.category, ok: r.ok !== false, err: r.error });
  }
  return log;
}

async function main() {
  console.log("DB:", DB_PATH);
  console.log("\n=== HAPI 1 — PASTRO ===");
  const counts = await cleanDb();
  console.log("Pas pastrimit:", JSON.stringify(counts, null, 2));

  const { startOnPort, stopServer: stop } = require("../server");
  const srv = await startOnPort(0);
  stopServer = stop;
  BASE = `http://127.0.0.1:${srv.address().port}/api`;

  console.log("\n=== HAPI 2 — REGJISTRIM ===");
  const log = await seedAll();
  for (const l of log) {
    console.log(`  ${l.ok ? "✅" : "❌"} ${l.t} ${l.d}${l.err ? " — " + l.err : ""}`);
  }

  const [dash, summary, pl, vatPeriod, z, sales, purchases, expenses] = await Promise.all([
    req("GET", "/dashboard"),
    req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`),
    req("GET", `/kontabilisti/pl?from=${FROM}&to=${TO}`),
    req("GET", "/vat/period?period_type=monthly&year=2026&period=8"),
    req("GET", `/z-reports?from=${FROM}&to=${TO}`),
    req("GET", `/sales-invoices?from=${FROM}&to=${TO}&status=finalized`),
    req("GET", `/purchase-invoices?from=${FROM}&to=${TO}`),
    req("GET", `/expenses?from=${FROM}&to=${TO}`),
  ]);

  const t = summary.totals;
  const b = summary.boxes;
  const dt = dash.totals;
  const sc = vatPeriod.selfCheck || {};
  const checksOk = (sc.checks || []).filter((c) => c.ok).length;
  const checksTotal = (sc.checks || []).length;

  // Libri shitjeve — sum from rows
  let salesNet = 0, salesVatRows = 0, salesGrossRows = 0;
  for (const r of z.rows || []) {
    salesNet += (r.sales_18_base || 0) + (r.sales_8_base || 0) + (r.sales_0_total || 0);
    salesVatRows += (r.sales_18_vat || 0) + (r.sales_8_vat || 0);
    salesGrossRows += r.grand_total || 0;
  }
  for (const r of sales.rows || []) {
    salesNet += r.subtotal || 0;
    salesVatRows += r.vat_total || 0;
    salesGrossRows += r.grand_total || 0;
  }

  let purchNet = 0, purchVat = 0, purchGross = 0;
  for (const r of purchases.rows || []) {
    purchNet += r.subtotal || 0;
    purchVat += r.vat_total || 0;
    purchGross += r.grand_total || 0;
  }

  let expNet = 0, expVat = 0, expGross = 0;
  for (const r of expenses.rows || []) {
    expGross += r.amount || 0;
    expVat += r.vat_amount || 0;
    expNet += (r.amount || 0) - (r.vat_amount || 0);
  }

  console.log("\n=== HAPI 3 — RAPORTI ===\n");

  console.log("A) PASQYRA (dashboard YTD — si në UI):");
  console.log(`  Shitje Totale (me TVSH): ${euro(dt.salesGross)}`);
  console.log(`  Blerje Totale (me TVSH): ${euro(dt.purchaseGross)}`);
  console.log(`  Shpenzime Totale (me TVSH): ${euro(dt.expenseTotal)}`);
  console.log(`  TVSH për pagesë: ${euro(dt.vatPayable)}`);
  console.log(`  Fitimi Bruto: ${euro(dt.grossProfit)}`);
  console.log(`  Fitimi Neto: ${euro(dt.netProfit)}`);

  console.log("\nB) KONTABILISTI (Gusht 2026 — /kontabilisti/summary):");
  console.log("  [Si shfaq hub-i në UI — 10 KPI]:");
  console.log(`  KPI 1 Shitjet totale (me TVSH): ${euro(t.salesGross)}`);
  console.log(`  KPI 2 Blerjet totale (me TVSH): ${euro(t.purchaseGross)}`);
  console.log(`  KPI 3 Shpenzimet totale (me TVSH): ${euro(t.expenseTotal)}`);
  console.log(`  KPI 4 TVSH e daljes: ${euro(t.outputVat)}`);
  console.log(`  KPI 5 TVSH e hyrjes: ${euro(t.inputVat)}`);
  console.log(`  KPI 6 TVSH për pagesë: ${euro(t.vatPayable)}`);
  console.log(`  KPI 7 Fitimi bruto: ${euro(t.grossProfit)}`);
  console.log(`  KPI 8 Fitimi neto: ${euro(t.netProfit)}`);
  console.log(`  KPI 9 Nr. faturave: ${t.invoiceCount}`);
  console.log(`  KPI 10 Periudha: ${FROM.slice(0, 7)}`);
  console.log("  [Vlera pa TVSH — nga motori]:");
  console.log(`  Shitje pa TVSH: ${euro(t.salesBase)} | Blerje pa TVSH (fatura): ${euro(t.purchaseInvoiceBase)} | Shpenzime pa TVSH: ${euro(t.expenseBase)}`);
  console.log("  Kutizat:");
  console.log(`  [9]=${euro(b["9"])} [10a]=${euro(b["10a"])} [10b]=${euro(b["10b"])} [10c]=${euro(b["10c"])}`);
  console.log(`  [11]=${euro(b["11"])} [12]=${euro(b["12"])} [14]=${euro(b["14"])}`);
  console.log(`  [31]=${euro(b["31"])} [43]=${euro(b["43"])} [45]=${euro(b["45"])} [47]=${euro(b["47"])}`);
  console.log(`  [K1]=${euro(b.K1)} [K2]=${euro(b.K2)} [30]=${euro(b["30"])}`);

  console.log("\nC) RAPORTET (Muaj — Gusht 2026):");
  console.log(`  Libri i Shitjeve: Total baza=${euro(t.salesBase)}, TVSH=${euro(t.outputVat)}, Bruto=${euro(t.salesGross)}`);
  console.log(`  Libri i Blerjeve: Total baza=${euro(t.purchaseInvoiceBase)}, TVSH=${euro(t.purchaseVatTotal)}, Bruto=${euro(t.purchaseGross)}`);
  console.log(`  Libri i Shpenzimeve: Total baza=${euro(t.expenseBase)}, TVSH=${euro(t.expenseVat)}, Bruto=${euro(t.expenseTotal)}`);
  console.log(`  TVSH për pagesë: ${euro(t.vatPayable)}`);
  console.log(`  Fitimi Neto: ${euro(t.netProfit)}`);

  console.log("\nD) DËRGO NË ATK — Gusht 2026:");
  console.log(`  Self-check: ${checksOk} / ${checksTotal}`);
  console.log(`  Kutizat: [10a]=${euro(b["10a"])} [10b]=${euro(b["10b"])} [10c]=${euro(b["10c"])} [11]=${euro(b["11"])}`);
  console.log(`           [12]=${euro(b["12"])} [14]=${euro(b["14"])} [30]=${euro(b["30"])}`);

  await stopServer();
}

main().catch(async (e) => {
  console.error(e);
  if (stopServer) await stopServer();
  process.exit(1);
});
