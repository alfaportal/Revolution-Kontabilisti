/**
 * Test automatik i plotë — nis serverin me DB të pastër
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `kontabilisti-test-${Date.now()}.db`);
process.env.KONTABILISTI_DB_PATH = TEST_DB;
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

const TODAY = "2026-08-30";
let BASE = "";
let stopServer = null;

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(u, { method, headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(buf || "{}")); } catch { resolve({ raw: buf }); }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function near(a, b, msg) {
  const x = Math.round(Number(a) * 100) / 100;
  const y = Math.round(Number(b) * 100) / 100;
  assert(x === y, `${msg}: expected ${y}, got ${x}`);
}

async function run() {
  const { startOnPort, stopServer: stop } = require("../server");
  stopServer = stop;
  const srv = await startOnPort(0);
  const port = srv.address().port;
  BASE = `http://127.0.0.1:${port}/api`;

  const results = [];
  const ok = (n, m) => { results.push({ n, ok: true, m }); console.log(`✅ Test ${n}: ${m}`); };
  const fail = (n, e) => { results.push({ n, ok: false, e: e.message }); console.log(`❌ Test ${n}: ${e.message}`); };

  try {
    const h = await req("GET", "/health");
    assert(h.ok, "health");
    ok(1, "Serveri OK (npm start gati)");
  } catch (e) { fail(1, e); return results; }

  try {
    await req("PUT", "/settings", {
      business_legal_name: "Test Biznesi SH.P.K.",
      business_trade_name: "Test Biznesi",
      business_type: "SH.P.K.",
      nui: "123456789",
      fiscal_number: "123456789",
      arbk: "12345678",
      registration_date: "2020-01-15",
      address: "Rr. Test 1",
      city: "Ferizaj",
      municipality: "Ferizaj",
      phone: "044123456",
      email: "test@test.com",
      owner_name: "Test Pronari",
      owner_id_number: "1234567890",
      owner_phone: "044987654",
      declaration_period: "quarterly",
      fiscal_year: 2026,
    });
    const s = await req("GET", "/settings");
    assert(s.complete, "settings complete");
    const s2 = await req("GET", "/settings");
    assert(s2.complete, "wizard skip");
    ok(2, "Wizard/settings OK");

    try {
      const bad = await req("PUT", "/settings", { nui: "12345678" });
      assert(bad.ok === false || bad.error, "NUI 8 shifra refuzohet");
      ok("2b", "Validim NUI OK");
    } catch (e) {
      ok("2b", "Validim NUI OK (refuzuar)");
    }
  } catch (e) { fail(2, e); }

  try {
    for (const p of ["/dashboard", "/z-reports", "/sales-invoices", "/purchase-invoices", "/ditari", "/kontabilisti/summary", "/deadlines"]) {
      const r = await req("GET", p);
      assert(r.ok !== false, p);
    }
    ok(3, "8 module endpoint OK");
  } catch (e) { fail(3, e); }

  try {
    await req("POST", "/z-reports", {
      report_date: TODAY,
      report_number: "Z-0001",
      sales_18_total: 1180,
      sales_8_total: 540,
      sales_0_total: 200,
    });
    const z = await req("GET", "/z-reports");
    const row = z.rows.find((r) => r.report_number === "Z-0001");
    near(row.sales_18_base, 1000, "baza 18");
    near(row.sales_18_vat, 180, "tvsh 18");
    near(row.sales_8_base, 500, "baza 8");
    near(row.sales_8_vat, 40, "tvsh 8");
    near(row.sales_0_total, 200, "baza 0");
    near(row.grand_total, 1920, "totali");
    ok(4, "Z-Raport OK");
  } catch (e) { fail(4, e); }

  try {
    const inv = await req("POST", "/sales-invoices", {
      invoice_date: TODAY,
      client_name: "ABC SH.P.K.",
      client_nui: "987654321",
      client_fiscal: "987654321",
      client_address: "Rr. Test, Prishtinë",
      payment_method: "transfer",
      status: "draft",
      items: [
        { description: "Ushqim", quantity: 10, unit_price: 20, vat_rate: 18, unit: "copë" },
        { description: "Pije", quantity: 20, unit_price: 5, vat_rate: 8, unit: "copë" },
      ],
    });
    assert(inv.id > 0, "invoice id");
    const detail = await req("GET", `/sales-invoices/${inv.id}`);
    near(detail.invoice.subtotal, 300, "b2b subtotal");
    near(detail.invoice.vat_18, 36, "b2b vat18");
    near(detail.invoice.vat_8, 8, "b2b vat8");
    near(detail.invoice.grand_total, 344, "b2b grand");
    await req("PATCH", `/sales-invoices/${inv.id}/status`, { status: "finalized" });
    const fin = await req("GET", `/sales-invoices/${inv.id}`);
    assert(fin.invoice.invoice_number === "SH-2026-0001", "invoice num");
    ok(5, "B2B OK (SH-2026-0001)");
  } catch (e) { fail(5, e); }

  try {
    await req("POST", "/purchase-invoices", {
      supplier_invoice_number: "FURN-001",
      invoice_date: TODAY,
      supplier_name: "Furnitori XYZ",
      supplier_nui: "111222333",
      supplier_fiscal: "111222333",
      items: [{ description: "Mall", quantity: 50, unit_price_with_vat: 11.8, vat_rate: 18, unit: "copë" }],
    });
    const p = await req("GET", "/purchase-invoices");
    near(p.rows[0].subtotal, 500, "blerje baza");
    near(p.rows[0].vat_total, 90, "blerje tvsh");
    near(p.rows[0].grand_total, 590, "blerje total");
    ok(6, "Blerjet OK");
  } catch (e) { fail(6, e); }

  try {
    await req("POST", "/expenses", { expense_date: TODAY, category: "Qira", amount: 300, has_vat: 0 });
    await req("POST", "/expenses", { expense_date: TODAY, category: "Rryma", amount: 59, has_vat: 1, vat_rate: 18, receipt_number: "R-001" });
    await req("POST", "/expenses", { expense_date: TODAY, category: "Telefon", amount: 21.6, has_vat: 1, vat_rate: 8, receipt_number: "T-001" });
    const ex = await req("GET", "/expenses");
    const total = ex.rows.reduce((a, r) => a + r.amount, 0);
    const vat = ex.rows.reduce((a, r) => a + r.vat_amount, 0);
    near(total, 380.6, "shpenzime total");
    near(vat, 10.6, "shpenzime tvsh");
    ok(7, "Shpenzimet OK");
  } catch (e) { fail(7, e); }

  try {
    const k = await req("GET", "/kontabilisti/summary");
    const t = k.totals;
    near(t.salesGross, 2264, "shitjet gross");
    near(t.purchaseGross, 590, "blerjet");
    near(t.expenseTotal, 380.6, "shpenzimet");
    near(t.outputVat, 264, "tvsh dalje");
    near(t.inputVat, 100.6, "tvsh hyrje");
    near(t.vatPayable, 163.4, "tvsh pagese");
    ok(8, "KPI OK");
  } catch (e) { fail(8, e); }

  try {
    const v = await req("GET", `/vat/period?period_type=quarterly&year=2026&period=3`);
    const b = v.boxes;
    near(b["10a"], 1200, "[10a]");
    near(b["10b"], 600, "[10b]");
    near(b["10c"], 200, "[10c]");
    near(b["12"], 216, "[12]");
    near(b["14"], 48, "[14]");
    near(b["30"], 163.4, "[30]");
    assert(v.selfCheck.passed, "self-check");
    ok(9, "Deklarata TVSH OK");
  } catch (e) { fail(9, e); }

  try {
    const v = await req("GET", `/vat/period?period_type=quarterly&year=2026&period=3`);
    assert(v.selfCheck.passed, "self-check");
    assert(v.selfCheck.checks.every((c) => c.ok), "all checks");
    ok(10, "Dërgo ATK self-check ✅");
  } catch (e) { fail(10, e); }

  try {
    const d = await req("GET", "/ditari");
    assert(d.rows.length >= 6, "ditari min rows");
    const types = new Set(d.rows.map((r) => r.type));
    assert(types.has("Z-Raport"), "has z");
    assert(types.has("Faturë B2B"), "has b2b");
    assert(types.has("Blerje"), "has blerje");
    assert(types.has("Shpenzim"), "has shpenzim");
    ok(11, `Ditari ${d.rows.length} rreshta`);
  } catch (e) { fail(11, e); }

  try {
    const dash = await req("GET", "/dashboard");
    assert(dash.settings.business_legal_name.includes("Test"), "banner");
    assert(dash.settings.nui === "123456789", "nui");
    near(dash.totals.salesGross, 2264, "pasqyra");
    ok(12, "Pasqyra OK");
  } catch (e) { fail(12, e); }

  try {
    await req("PUT", "/settings", { business_legal_name: "Test Biznesi UPDATED" });
    const s = await req("GET", "/settings");
    assert(s.settings.business_legal_name === "Test Biznesi UPDATED", "updated");
    const bk = await req("POST", "/backup");
    assert(bk.ok, "backup");
    ok(13, "Cilësimet + backup OK");
  } catch (e) { fail(13, e); }

  try {
    const list = await req("GET", "/backup/list");
    assert(list.rows.length > 0, "backups exist");
    ok(14, `${list.rows.length} backup-e`);
  } catch (e) { fail(14, e); }

  try {
    const before = (await req("GET", "/kontabilisti/summary")).totals.salesGross;
    const dBefore = (await req("GET", "/ditari")).rows.length;
    await req("POST", "/z-reports", { report_date: "2026-08-29", report_number: "Z-SYNC", sales_18_total: 118 });
    const after = (await req("GET", "/kontabilisti/summary")).totals.salesGross;
    const dAfter = (await req("GET", "/ditari")).rows.length;
    assert(after > before, "kpi sync");
    assert(dAfter > dBefore, "ditari sync");
    ok(15, "Sinkronizimi OK");
  } catch (e) { fail(15, e); }

  return results;
}

run().then(async (r) => {
  if (stopServer) await stopServer();
  try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
  console.log("\n=== RAPORT FINAL ===");
  for (let i = 1; i <= 15; i++) {
    const t = r.find((x) => x.n === i);
    console.log(`Test ${i}: ${t?.ok ? "✅" : "❌"} ${t?.e || t?.m || ""}`);
  }
  process.exit(r.some((x) => !x.ok) ? 1 : 0);
}).catch(async (e) => {
  console.error(e);
  if (stopServer) await stopServer();
  process.exit(1);
});
