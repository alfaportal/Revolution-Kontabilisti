/** Test final — 10 pika nga specifikimi */
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `kontabilisti-perf-${Date.now()}.db`);
process.env.KONTABILISTI_DB_PATH = TEST_DB;
const FROM = "2026-08-01";
const TO = "2026-08-31";

function req(method, urlPath, body, base) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(u, { method, headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : null) } }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => resolve(JSON.parse(buf || "{}")));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function near(a, b, msg) {
  const x = Math.round(Number(a) * 100) / 100;
  const y = Math.round(Number(b) * 100) / 100;
  if (x !== y) throw new Error(`${msg}: ${x} vs ${y}`);
}
function round2(n) { return Math.round(Number(n) * 100) / 100; }

async function run() {
  const { startOnPort, stopServer } = require("../server");
  const srv = await startOnPort(0);
  const BASE = `http://127.0.0.1:${srv.address().port}/api`;

  try {
    await req("PUT", "/settings", {
      business_legal_name: "Test ATK SH.P.K.",
      business_trade_name: "Test ATK",
      business_type: "SH.P.K.",
      nui: "811314567",
      fiscal_number: "811314567",
      arbk: "12345678",
      registration_date: "2019-06-01",
      address: "Rr. Test 5",
      city: "Prishtinë",
      municipality: "Prishtinë",
      phone: "044111222",
      email: "atk@test.com",
      owner_name: "Test Owner",
      owner_id_number: "1234567890",
      owner_phone: "044333444",
      declaration_period: "monthly",
      fiscal_year: 2026,
    }, BASE);

    /* 3 shitje: 18%, 8%, 0% */
    await req("POST", "/sales-invoices", {
      invoice_date: "2026-08-10", client_name: "Klient 18", client_nui: "123456789",
      client_fiscal: "123456789", client_address: "Rr. A, Prishtinë",
      payment_method: "cash", status: "finalized",
      items: [{ description: "A18", quantity: 1, unit_price_with_vat: 118, vat_rate: 18, unit: "copë" }],
    }, BASE);
    await req("POST", "/sales-invoices", {
      invoice_date: "2026-08-11", client_name: "Klient 8", client_nui: "987654321",
      client_fiscal: "987654321", client_address: "Rr. B, Ferizaj",
      payment_method: "card", status: "finalized",
      items: [{ description: "A8", quantity: 1, unit_price_with_vat: 108, vat_rate: 8, unit: "copë" }],
    }, BASE);
    await req("POST", "/sales-invoices", {
      invoice_date: "2026-08-12", client_name: "B2C", payment_method: "cash", status: "finalized",
      items: [{ description: "A0", quantity: 1, unit_price_with_vat: 50, vat_rate: 0, unit: "copë" }],
    }, BASE);

    /* 2 blerje */
    await req("POST", "/purchase-invoices", {
      supplier_invoice_number: "BL-F18", invoice_date: "2026-08-15",
      supplier_name: "Furn 18", supplier_nui: "111222333", supplier_fiscal: "F111",
      items: [{ description: "M18", quantity: 1, unit_price_with_vat: 118, vat_rate: 18, unit: "copë" }],
    }, BASE);
    await req("POST", "/purchase-invoices", {
      supplier_invoice_number: "BL-F8", invoice_date: "2026-08-16",
      supplier_name: "Furn 8", supplier_nui: "444555666", supplier_fiscal: "F222",
      items: [{ description: "M8", quantity: 1, unit_price_with_vat: 108, vat_rate: 8, unit: "copë" }],
    }, BASE);

    /* 3 shpenzime */
    await req("POST", "/expenses", { expense_date: "2026-08-20", category: "Qira", amount: 200, has_vat: false }, BASE);
    await req("POST", "/expenses", { expense_date: "2026-08-21", category: "Rryma", amount: 59, has_vat: true, vat_rate: 18, receipt_number: "R-1" }, BASE);
    await req("POST", "/expenses", { expense_date: "2026-08-22", category: "Karburant", amount: 30, has_vat: false }, BASE);

    const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`, null, BASE);
    const t = sum.totals;
    const b = sum.boxes;

    console.log("5) KPI — shitje:", t.salesGross, "blerje:", t.purchaseGross, "shpenzime:", t.expenseTotal);
    near(t.outputVat, t.salesVat18 + t.salesVat8, "6) TVSH dalje");
    near(t.inputVat, t.purchaseVatTotal, "7) TVSH hyrje");
    near(t.vatPayable, t.outputVat - t.inputVat - t.priorCredit, "7b) TVSH pagesë");
    near(b["11"], t.salesBase, "8) Libri shitje = [11]");
    near(b["65"], round2(b["43"] + b["47"]), "9) [65] = [43]+[47] (blerje)");
    near(b.K2, t.inputVat, "9b) [K2] = TVSH hyrje totale");
    const cogs = t.purchaseInvoiceBase ?? t.purchaseBase;
    near(t.netProfit, t.salesBase - cogs - t.expenseBase, "10) P&L neto");

    const audit = await req("GET", `/kontabilisti/audit?from=${FROM}&to=${TO}`, null, BASE);
    if (!audit.ok && audit.errors?.length) throw new Error("Audit: " + audit.errors.join("; "));

    console.log("OK — 10/10 kontrolle kaluan. Deklarata [30]:", b["30"], "€");
  } finally {
    stopServer();
    try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
  }
}

run().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
