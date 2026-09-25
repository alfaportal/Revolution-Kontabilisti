/**
 * Test lidhje ndërmjet moduleve — një DB, TVSH saktë (pa build)
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `kontabilisti-sync-${Date.now()}.db`);
process.env.KONTABILISTI_DB_PATH = TEST_DB;

function req(method, urlPath, body, base) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(u, {
      method,
      headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : null) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => resolve(JSON.parse(buf || "{}")));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function assert(c, m) { if (!c) throw new Error(m); }
function near(a, b, m) {
  assert(Math.round(Number(a) * 100) === Math.round(Number(b) * 100), `${m}: ${a} vs ${b}`);
}

async function run() {
  const { startOnPort, stopServer } = require("../server");
  const srv = await startOnPort(0);
  const BASE = `http://127.0.0.1:${srv.address().port}/api`;
  const FROM = "2026-08-01";
  const TO = "2026-08-30";

  try {
    await req("PUT", "/settings", {
      business_legal_name: "Test Sync SH.P.K.",
      business_trade_name: "Test Sync",
      business_type: "SH.P.K.",
      nui: "811314567",
      fiscal_number: "811314567",
      arbk: "87654321",
      registration_date: "2021-03-01",
      address: "Rr. Sync 1",
      city: "Gjilan",
      municipality: "Gjilan",
      phone: "044555666",
      email: "sync@test.com",
      owner_name: "Sync Owner",
      owner_id_number: "9876543210",
      owner_phone: "044777888",
      fiscal_year: 2026,
      declaration_period: "quarterly",
    }, BASE);

    /* SHITJE → summary */
    await req("POST", "/z-reports", {
      report_date: "2026-08-20", report_number: "Z-1", sales_18_total: 118,
    }, BASE);
    await req("POST", "/sales-invoices", {
      invoice_date: "2026-08-21", client_name: "Klienti A", client_nui: "123456789",
      client_fiscal: "123456789", client_address: "Rr. Sync, Prishtinë",
      payment_method: "transfer",
      status: "finalized",
      items: [{ description: "Shërbim", quantity: 1, unit_price_with_vat: 236, vat_rate: 18, unit: "copë" }],
    }, BASE);

    let sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`, null, BASE);
    near(sum.totals.salesGross, 354, "shitje gross Z118+B2B236");
    near(sum.totals.outputVat, 54, "TVSH dalje");

    /* BLERJE → summary */
    await req("POST", "/purchase-invoices", {
      supplier_invoice_number: "BL-SYNC-1",
      invoice_date: "2026-08-22", supplier_name: "Furnitori", supplier_nui: "987654321",
      supplier_fiscal: "F-SYNC",
      items: [{ description: "Mall", quantity: 1, unit_price_with_vat: 118, vat_rate: 18, unit: "copë" }],
    }, BASE);
    sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`, null, BASE);
    near(sum.totals.purchaseGross, 118, "blerje gross");
    near(sum.totals.inputVat, 18, "TVSH hyrje nga blerje");
    near(sum.totals.vatPayable, 36, "TVSH për pagesë 54-18");

    /* SHPENZIM me TVSH → summary */
    await req("POST", "/expenses", {
      expense_date: "2026-08-23", category: "Rryma", description: "Rrymë", amount: 59,
      has_vat: true, vat_rate: 18, receipt_number: "R-SYNC-1",
    }, BASE);
    sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`, null, BASE);
    assert(sum.totals.expenseTotal > 0, "shpenzime totale");
    assert(sum.totals.inputVat > 18, "TVSH hyrje rritet me shpenzim");

    /* Ditari — filtri datës */
    const dit = await req("GET", `/ditari?from=2026-08-21&to=2026-08-23`, null, BASE);
    assert(dit.rows.every((r) => r.date >= "2026-08-21" && r.date <= "2026-08-23"), "ditari respekton datat");
    assert(dit.rows.some((r) => r.type === "Shpenzim"), "ditari shpenzim");

    /* Libri shitjes = deklarata TVSH */
    near(sum.boxes["12"], sum.totals.salesVat18, "kutia 12 = TVSH 18% reale");
    near(sum.boxes["30"], sum.totals.vatPayable, "kutia 30 = TVSH për pagesë");

    /* Self-check */
    const vat = await req("GET", `/vat/period?period_type=monthly&year=2026&period=8`, null, BASE);
    assert(vat.selfCheck.passed, "self-check ATK");

    console.log("OK — Lidhjet ndërmjet moduleve funksionojnë (shitje→blerje→shpenzime→kontabilisti→ditari)");
  } finally {
    stopServer();
    try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
  }
}

run().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
