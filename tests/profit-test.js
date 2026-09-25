/**
 * Test fitimi bruto/neto — 3 skenarë sipas specifikimit të Naserit
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const FROM = "2026-08-01";
const TO = "2026-08-31";

function req(base, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(base + urlPath, {
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

function near(a, b, label) {
  const x = Math.round(Number(a) * 100) / 100;
  const y = Math.round(Number(b) * 100) / 100;
  return { ok: x === y, got: x, expected: y, label };
}

async function cleanDb(db) {
  db.exec("DELETE FROM sales_invoice_items");
  db.exec("DELETE FROM sales_invoices");
  db.exec("DELETE FROM purchase_invoice_items");
  db.exec("DELETE FROM purchase_invoices");
  db.exec("DELETE FROM z_reports");
  db.exec("DELETE FROM expenses");
}

async function readTotals(base) {
  const [summary, dash, pl] = await Promise.all([
    req(base, "GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`),
    req(base, "GET", `/dashboard`),
    req(base, "GET", `/kontabilisti/pl?from=${FROM}&to=${TO}`),
  ]);
  const t = summary.totals;
  const same = (a, b) => Math.round(a * 100) === Math.round(b * 100);
  const modulesMatch = same(t.grossProfit, dash.totals.grossProfit)
    && same(t.netProfit, dash.totals.netProfit)
    && same(t.grossProfit, pl.grossProfit)
    && same(t.netProfit, pl.netProfit);
  return { t, modulesMatch };
}

async function ensureSettings(base) {
  await req(base, "PUT", "/settings", {
    business_legal_name: "Test Fitim SH.P.K.",
    business_trade_name: "Test Fitim",
    business_type: "SH.P.K.",
    nui: "123456789",
    fiscal_number: "123456789",
    arbk: "12345678",
    registration_date: "2020-01-01",
    address: "Rr. Test 1",
    city: "Ferizaj",
    municipality: "Ferizaj",
    phone: "044123456",
    email: "test@test.com",
    owner_name: "Test",
    owner_id_number: "1234567890",
    owner_phone: "044123456",
    declaration_period: "monthly",
    fiscal_year: 2026,
  });
}

const SCENARIOS = [
  {
    name: "Testi 1",
    expected: { gross: 700, net: 200 },
    async seed(base) {
      await req(base, "POST", "/z-reports", { report_date: "2026-08-01", sales_18_total: 1180 });
      await req(base, "POST", "/purchase-invoices", {
        supplier_invoice_number: "BL-1", invoice_date: "2026-08-02",
        supplier_name: "Furnitor", supplier_nui: "111222333", supplier_fiscal: "111222333",
        items: [{ description: "Mall", quantity: 1, unit_price_with_vat: 354, vat_rate: 18, unit: "copë" }],
      });
      await req(base, "POST", "/expenses", { expense_date: "2026-08-03", category: "Qira", amount: 500, has_vat: 0 });
    },
  },
  {
    name: "Testi 2",
    expected: { gross: 2000, net: 1900 },
    async seed(base) {
      await req(base, "POST", "/z-reports", {
        report_date: "2026-08-02", sales_18_total: 2360, sales_8_total: 540,
      });
      await req(base, "POST", "/purchase-invoices", {
        supplier_invoice_number: "BL-2", invoice_date: "2026-08-03",
        supplier_name: "Furnitor", supplier_nui: "111222333", supplier_fiscal: "111222333",
        items: [{ description: "Mall", quantity: 1, unit_price_with_vat: 590, vat_rate: 18, unit: "copë" }],
      });
      await req(base, "POST", "/expenses", {
        expense_date: "2026-08-04", category: "Rryma", amount: 118, has_vat: 1, vat_rate: 18, receipt_number: "F-001",
      });
    },
  },
  {
    name: "Testi 3",
    expected: { gross: 400, net: -50 },
    async seed(base) {
      await req(base, "POST", "/z-reports", { report_date: "2026-08-03", sales_18_total: 590 });
      await req(base, "POST", "/sales-invoices", {
        invoice_date: "2026-08-04",
        client_name: "ABC SH.P.K.", client_nui: "123456789", client_fiscal: "123456789",
        client_address: "Rr. 1", payment_method: "cash", status: "finalized",
        items: [{ description: "Artikull", quantity: 1, unit_price: 200, vat_rate: 18, unit: "copë" }],
      });
      await req(base, "POST", "/purchase-invoices", {
        supplier_invoice_number: "BL-3", invoice_date: "2026-08-05",
        supplier_name: "Furnitor", supplier_nui: "444555666", supplier_fiscal: "444555666",
        items: [{ description: "Mall", quantity: 1, unit_price_with_vat: 324, vat_rate: 8, unit: "copë" }],
      });
      await req(base, "POST", "/expenses", {
        expense_date: "2026-08-06", category: "Karburant", amount: 59, has_vat: 1, vat_rate: 18, receipt_number: "F-002",
      });
      await req(base, "POST", "/expenses", { expense_date: "2026-08-07", category: "Qira", amount: 400, has_vat: 0 });
    },
  },
];

async function main() {
  const { initDatabase, getDb } = require("../database");
  const { startOnPort, stopServer } = require("../server");
  let allOk = true;

  for (const sc of SCENARIOS) {
    const dbPath = path.join(os.tmpdir(), `profit-test-${Date.now()}.db`);
    process.env.KONTABILISTI_DB_PATH = dbPath;
    const srv = await startOnPort(0);
    const base = `http://127.0.0.1:${srv.address().port}/api`;

    await initDatabase();
    cleanDb(getDb());
    await ensureSettings(base);
    await sc.seed(base);

    const { t, modulesMatch } = await readTotals(base);
    const g = near(t.grossProfit, sc.expected.gross, "Fitimi Bruto");
    const n = near(t.netProfit, sc.expected.net, "Fitimi Neto");

    console.log(`\n${sc.name}:`);
    console.log(`  Fitimi Bruto — pritur: €${sc.expected.gross.toFixed(2)}, rezultati: €${g.got.toFixed(2)} — ${g.ok ? "✅" : "❌"}`);
    console.log(`  Fitimi Neto  — pritur: €${sc.expected.net.toFixed(2)}, rezultati: €${n.got.toFixed(2)} — ${n.ok ? "✅" : "❌"}`);
    console.log(`  Pasqyra = Kontabilisti = Raportet — ${modulesMatch ? "✅" : "❌"}`);
    console.log(`  (salesBase=${t.salesBase}, purchaseBase=${t.purchaseInvoiceBase}, expenseBase=${t.expenseBase})`);

    if (!g.ok || !n.ok || !modulesMatch) allOk = false;

    await stopServer();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
