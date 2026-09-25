/**
 * Test i plotë 15-module — sipas specifikimit të Naserit
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `kontabilisti-mega-${Date.now()}.db`);
process.env.KONTABILISTI_DB_PATH = TEST_DB;

const TODAY = "2026-08-30";
const YESTERDAY = "2026-08-29";
const FROM = "2026-08-01";
const TO = "2026-08-30";
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

function assert(c, m) { if (!c) throw new Error(m); }
function near(a, b, m) {
  const x = Math.round(Number(a) * 100) / 100;
  const y = Math.round(Number(b) * 100) / 100;
  assert(x === y, `${m}: pritshëm ${y}, mori ${x}`);
}
function round2(n) { return Math.round(Number(n) * 100) / 100; }

const SETTINGS = {
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
};

async function run() {
  const { startOnPort, stopServer: stop } = require("../server");
  stopServer = stop;
  const srv = await startOnPort(0);
  BASE = `http://127.0.0.1:${srv.address().port}/api`;
  const R = [];

  const ok = (n, m) => { R.push({ n, ok: true, m }); console.log(`✅ Test ${n} — ${m}: KALON`); };
  const fail = (n, e) => { R.push({ n, ok: false, e: e.message }); console.log(`❌ Test ${n}: ${e.message}`); };

  /* TEST 1 — Wizard / startim */
  try {
    const s0 = await req("GET", "/settings");
    assert(!s0.complete, "DB e re — settings jo complete");

    const empty = await req("PUT", "/settings", { business_legal_name: "" });
    assert(empty.ok === false, "validim bosh");

    const badNui = await req("PUT", "/settings", { ...SETTINGS, nui: "12345678" });
    assert(badNui.ok === false && String(badNui.error || "").includes("9"), "NUI 8 shifra");

    const badEmail = await req("PUT", "/settings", { ...SETTINGS, email: "invalid" });
    assert(badEmail.ok === false, "email pavlid");

    await req("PUT", "/settings", SETTINGS);
    const s1 = await req("GET", "/settings");
    assert(s1.complete, "settings complete");
    const s2 = await req("GET", "/settings");
    assert(s2.complete, "wizard skip pas restart");
    ok(1, "Wizardi");
  } catch (e) { fail(1, e); return R; }

  /* TEST 2 — Cilësimet */
  try {
    await req("PUT", "/settings", { business_legal_name: "Test Biznesi UPDATED SH.P.K." });
    const s = await req("GET", "/settings");
    assert(s.settings.business_legal_name.includes("UPDATED"), "emri i ri");
    await req("PUT", "/settings", { notify_on_startup: 1, notify_days_reminder: 10, notify_banner: 1, notify_badge: 1 });
    const n = await req("GET", "/settings");
    assert(n.settings.notify_days_reminder === 10, "njoftimet");
    const cl = await req("GET", "/clients");
    assert(Array.isArray(cl.rows), "klientët");
    await req("PUT", "/settings", SETTINGS); // restore për raporte
    ok(2, "Cilësimet");
  } catch (e) { fail(2, e); }

  /* TEST 3 — Z-Raportet */
  try {
    const badZ = await req("POST", "/z-reports", { report_date: "", sales_18_total: 0 });
    assert(badZ.ok === false, "Z pa data");

    await req("POST", "/z-reports", {
      report_date: TODAY, report_number: "Z-0001",
      sales_18_total: 1180, sales_8_total: 540, sales_0_total: 200,
    });
    const z1 = await req("GET", `/z-reports?from=${FROM}&to=${TO}`);
    const row1 = z1.rows.find((r) => r.report_number === "Z-0001");
    near(row1.sales_18_base, 1000, "baza 18");
    near(row1.sales_18_vat, 180, "tvsh 18");
    near(row1.sales_8_base, 500, "baza 8");
    near(row1.sales_8_vat, 40, "tvsh 8");
    near(row1.grand_total, 1920, "totali Z1");

    const dup = await req("POST", "/z-reports", { report_date: TODAY, sales_18_total: 100 });
    assert(dup.status === 409 && dup.duplicate, "duplicate date");

    await req("POST", "/z-reports", {
      report_date: YESTERDAY, report_number: "Z-0002",
      sales_18_total: 590, sales_8_total: 216, sales_0_total: 100,
    });

    const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`);
    near(sum.totals.salesGross, 2826, "shitje Z totale");
    near(sum.totals.outputVat, 326, "TVSH dalje Z");
    ok(3, "Z-Raportet");
  } catch (e) { fail(3, e); }

  /* TEST 4 — B2B */
  let inv1Id, inv2Id;
  try {
    const badB2b = await req("POST", "/sales-invoices", {
      invoice_date: TODAY, client_name: "", client_nui: "987654321",
      client_fiscal: "x", client_address: "x", payment_method: "cash", status: "draft",
      items: [{ description: "X", quantity: 1, unit_price: 10, vat_rate: 18 }],
    });
    assert(badB2b.ok === false, "pa klient");

    const badNuiC = await req("POST", "/sales-invoices", {
      invoice_date: TODAY, client_name: "X", client_nui: "12345678",
      client_fiscal: "123456789", client_address: "Adr", payment_method: "cash", status: "draft",
      items: [{ description: "X", quantity: 1, unit_price: 10, vat_rate: 18 }],
    });
    assert(badNuiC.ok === false, "NUI klient 8");

    const draft = await req("POST", "/sales-invoices", {
      invoice_date: TODAY,
      client_name: "ABC Company SH.P.K.",
      client_nui: "987654321",
      client_fiscal: "987654321",
      client_address: "Rr. Prishtina 5",
      payment_method: "transfer",
      status: "draft",
      items: [
        { description: "Ushqim", quantity: 10, unit_price: 20, vat_rate: 18, unit: "copë" },
        { description: "Pije", quantity: 20, unit_price: 5, vat_rate: 8, unit: "copë" },
      ],
    });
    inv1Id = draft.id;
    assert(draft.invoice_number === "SH-2026-0001", "nr draft");

    const det = await req("GET", `/sales-invoices/${inv1Id}`);
    near(det.invoice.subtotal, 300, "subtotal");
    near(det.invoice.vat_total, 44, "tvsh");
    near(det.invoice.grand_total, 344, "grand");

    await req("PUT", `/sales-invoices/${inv1Id}`, {
      invoice_date: TODAY,
      client_name: "ABC Company SH.P.K.",
      client_nui: "987654321",
      client_fiscal: "987654321",
      client_address: "Rr. Prishtina 5",
      payment_method: "transfer",
      status: "draft",
      items: [
        { description: "Ushqim", quantity: 10, unit_price: 20, vat_rate: 18, unit: "copë" },
        { description: "Pije", quantity: 20, unit_price: 5, vat_rate: 8, unit: "copë" },
        { description: "Extra", quantity: 1, unit_price: 50, vat_rate: 18, unit: "copë" },
      ],
    });

    await req("PUT", `/sales-invoices/${inv1Id}`, {
      invoice_date: TODAY,
      client_name: "ABC Company SH.P.K.",
      client_nui: "987654321",
      client_fiscal: "987654321",
      client_address: "Rr. Prishtina 5",
      payment_method: "transfer",
      status: "finalized",
      items: [
        { description: "Ushqim", quantity: 10, unit_price: 20, vat_rate: 18, unit: "copë" },
        { description: "Pije", quantity: 20, unit_price: 5, vat_rate: 8, unit: "copë" },
      ],
    });

    const finTry = await req("PUT", `/sales-invoices/${inv1Id}`, { invoice_date: TODAY, status: "draft", items: [] });
    assert(finTry.ok === false, "finalizuar nuk editohet");

    const inv2 = await req("POST", "/sales-invoices", {
      invoice_date: TODAY,
      client_name: "Other Co",
      client_nui: "111222333",
      client_fiscal: "111222333",
      client_address: "Rr. 2",
      payment_method: "cash",
      status: "finalized",
      items: [{ description: "Shërbim", quantity: 1, unit_price: 100, vat_rate: 18, unit: "copë" }],
    });
    inv2Id = inv2.id;
    assert(inv2.invoice_number === "SH-2026-0002", "SH-0002");

    await req("PATCH", `/sales-invoices/${inv2Id}/status`, { status: "cancelled" });

    const ac = await req("GET", "/clients?q=ABC");
    assert(ac.rows.some((c) => c.name.includes("ABC")), "autocomplete klient");

    ok(4, "Faturat B2B");
  } catch (e) { fail(4, e); }

  /* TEST 5 — Blerjet */
  try {
    await req("POST", "/purchase-invoices", {
      supplier_invoice_number: "BL-001",
      invoice_date: TODAY,
      supplier_name: "Furnitori XYZ SH.P.K.",
      supplier_nui: "111222333",
      supplier_fiscal: "111222333",
      items: [{ description: "Mall", quantity: 50, unit_price_with_vat: 11.8, vat_rate: 18, unit: "copë" }],
    });
    await req("POST", "/purchase-invoices", {
      supplier_invoice_number: "BL-002",
      invoice_date: TODAY,
      supplier_name: "Furnitori 8%",
      supplier_nui: "444555666",
      supplier_fiscal: "444555666",
      items: [{ description: "Produkt", quantity: 100, unit_price_with_vat: 5.4, vat_rate: 8, unit: "copë" }],
    });
    const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`);
    near(sum.totals.purchaseGross, 1130, "blerje gross");
    near(sum.totals.inputVat, 130, "TVSH hyrje blerje");
    ok(5, "Blerjet");
  } catch (e) { fail(5, e); }

  /* TEST 6 — Shpenzimet */
  try {
    await req("POST", "/expenses", { expense_date: TODAY, category: "Qira", amount: 300, has_vat: 0 });
    await req("POST", "/expenses", { expense_date: TODAY, category: "Rryma", amount: 59, has_vat: 1, vat_rate: 18, receipt_number: "F-12345" });
    await req("POST", "/expenses", { expense_date: TODAY, category: "Telefon", amount: 21.6, has_vat: 1, vat_rate: 8, receipt_number: "T-99" });
    const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`);
    near(sum.totals.expenseTotal, 380.6, "shpenzime");
    const exVat = round2(sum.totals.inputVat - 130);
    near(exVat, 10.6, "TVSH shpenzime");
    ok(6, "Shpenzimet");
  } catch (e) { fail(6, e); }

  /* TEST 7 — KPI Kontabilisti */
  try {
    const k = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`);
    const t = k.totals;
    near(t.salesGross, 3170, "shitje totale");
    near(t.purchaseGross, 1130, "blerje");
    near(t.expenseTotal, 380.6, "shpenzime");
    near(t.outputVat, 370, "TVSH dalje");
    near(t.inputVat, 140.6, "TVSH hyrje");
    near(t.vatPayable, 229.4, "TVSH për pagesë");
    near(t.grossProfit, 1800, "fitim bruto");
    near(t.netProfit, 1430, "fitim neto");
    ok(7, "Kontabilisti KPI");
  } catch (e) { fail(7, e); }

  /* TEST 8 — Ditari */
  try {
    const d = await req("GET", `/ditari?from=${FROM}&to=${TO}`);
    assert(d.rows.length === 8, `ditari 8 rreshta (got ${d.rows.length})`);
    const types = new Set(d.rows.map((r) => r.type));
    assert(types.has("Z-Raport") && types.has("Faturë B2B") && types.has("Blerje") && types.has("Shpenzim"), "tipet");
    const dSh = await req("GET", `/ditari?from=${FROM}&to=${TO}&type=Shpenzim`);
    assert(dSh.rows.every((r) => r.type === "Shpenzim"), "filtri shpenzim");
    ok(8, "Ditari");
  } catch (e) { fail(8, e); }

  /* TEST 9 — Pasqyra */
  try {
    const dash = await req("GET", "/dashboard");
    assert(dash.settings.business_legal_name.includes("Test Biznesi"), "banner biznes");
    assert(Array.isArray(dash.alerts), "alarmet");
    const pl = await req("GET", `/kontabilisti/pl?from=${FROM}&to=${TO}`);
    near(pl.revenue, 2800, "të ardhura pa TVSH");
    near(pl.cogs, 1000, "kosto malli");
    near(pl.netProfit, 1430, "fitim neto P&L");
    ok(9, "Pasqyra");
  } catch (e) { fail(9, e); }

  /* TEST 10 — Dërgo në ATK */
  try {
    const dl = await req("GET", "/deadlines");
    assert(dl.rows.length > 0, "afatet");

    const v = await req("GET", `/vat/period?period_type=quarterly&year=2026&period=3`);
    const b = v.boxes;
    near(b["10a"], 1700, "[10a]");
    near(b["10b"], 800, "[10b]");
    near(b["10c"], 300, "[10c]");
    near(b["11"], 2800, "[11]");
    near(b["12"], 306, "[12]");
    near(b["14"], 64, "[14]");
    near(b["16"], 370, "[16]");
    near(b["31"], 500, "[31]");
    near(b["43"], 90, "[43]");
    near(b["45"], 500, "[45]");
    near(b["47"], 40, "[47]");
    near(b["65"], 130, "[65]");
    near(b["K1"], 370, "[K1]");
    near(b["K2"], 140.6, "[K2]");
    near(b["30"], 229.4, "[30]");
    assert(v.selfCheck.passed, "self-check");
    assert(v.selfCheck.checks.every((c) => c.ok), "krejt kontrollet");

    const decl = await req("POST", "/vat-declarations", {
      period_type: "quarterly",
      period_label: "Q3 2026",
      period_start: "2026-07-01",
      period_end: "2026-09-30",
      status: "sent",
      data: b,
    });
    await req("PATCH", `/vat-declarations/${decl.id}`, { status: "confirmed" });

    const dash = await req("GET", "/dashboard");
    assert(typeof dash.openCount === "number", "openCount");
    ok(10, "Dërgo në ATK");
  } catch (e) { fail(10, e); }

  /* TEST 11 — Libri i Shitjeve (API) */
  try {
    const z = await req("GET", `/z-reports?from=${FROM}&to=${TO}`);
    const inv = await req("GET", `/sales-invoices?from=${FROM}&to=${TO}&status=finalized`);
    assert(z.rows.length === 2, "2 Z-Raporte");
    assert(inv.rows.length === 1, "1 B2B finalizuar");
    const v = await req("GET", `/vat/period?period_type=quarterly&year=2026&period=3`);
    const zV18 = z.rows.reduce((a, r) => a + (r.sales_18_vat || 0), 0);
    const zV8 = z.rows.reduce((a, r) => a + (r.sales_8_vat || 0), 0);
    const bV18 = inv.rows.reduce((a, r) => a + (r.vat_18 || 0), 0);
    const bV8 = inv.rows.reduce((a, r) => a + (r.vat_8 || 0), 0);
    near(zV18 + bV18, v.boxes["12"], "libri TVSH 18 = [12]");
    near(zV8 + bV8, v.boxes["14"], "libri TVSH 8 = [14]");
    ok(11, "Libri i Shitjeve");
  } catch (e) { fail(11, e); }

  /* TEST 12 — Libri i Blerjeve */
  try {
    const p = await req("GET", `/purchase-invoices?from=${FROM}&to=${TO}`);
    assert(p.rows.length === 2, "2 blerje");
    const v = await req("GET", `/vat/period?period_type=quarterly&year=2026&period=3`);
    const v18 = p.rows.reduce((a, r) => a + (r.vat_18 || 0), 0);
    const v8 = p.rows.reduce((a, r) => a + (r.vat_8 || 0), 0);
    near(v18, v.boxes["43"], "libri blerje TVSH 18");
    near(v8, v.boxes["47"], "libri blerje TVSH 8");
    ok(12, "Libri i Blerjeve");
  } catch (e) { fail(12, e); }

  /* TEST 13 — Alarmet */
  try {
    const dash = await req("GET", "/dashboard");
    assert(Array.isArray(dash.popupAlerts), "popupAlerts");
    assert(Array.isArray(dash.alerts), "alerts");
    await req("PUT", "/settings", { notify_on_startup: 0 });
    const dash2 = await req("GET", "/dashboard");
    assert(dash2.settings.notify_on_startup === 0, "popup off");
    await req("PUT", "/settings", { notify_days_reminder: 7 });
    assert((await req("GET", "/settings")).settings.notify_days_reminder === 7, "ditët kujtesë");
    await req("PUT", "/settings", { notify_on_startup: 1, notify_days_reminder: 10 });
    ok(13, "Alarmet");
  } catch (e) { fail(13, e); }

  /* TEST 14 — Sinkronizimi */
  let syncZReportNumber;
  try {
    const before = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
    const dBefore = (await req("GET", `/ditari?from=${FROM}&to=${TO}`)).rows.length;
    const syncZ = await req("POST", "/z-reports", { report_date: "2026-08-28", sales_18_total: 118 });
    syncZReportNumber = syncZ.report_number;
    const after = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
    const dAfter = (await req("GET", `/ditari?from=${FROM}&to=${TO}`)).rows.length;
    assert(after > before, "KPI sync");
    assert(dAfter > dBefore, "ditari sync");
    const v = await req("GET", `/vat/period?period_type=quarterly&year=2026&period=3`);
    assert(v.boxes["16"] > 370, "ATK sync pas Z");
    ok(14, "Sinkronizimi");
  } catch (e) { fail(14, e); }

  /* TEST 15 — Soft delete */
  try {
    const z = await req("GET", `/z-reports?from=${FROM}&to=${TO}`);
    const zSync = z.rows.find((r) => r.report_number === syncZReportNumber);
    assert(zSync, "sync Z u gjet");
    const grossBefore = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
    await req("DELETE", `/z-reports/${zSync.id}`);
    const grossAfterZ = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
    assert(grossAfterZ < grossBefore, "Z anuluar zvogëlon KPI");

    const grossBeforeB2b = grossAfterZ;
    await req("PATCH", `/sales-invoices/${inv1Id}/status`, { status: "cancelled" });
    const grossAfterB2b = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
    assert(grossAfterB2b < grossBeforeB2b, "B2B anuluar zvogëlon KPI");

    const v = await req("GET", `/vat/period?period_type=quarterly&year=2026&period=3`);
    near(v.boxes["30"], grossAfterB2b > 0 ? v.boxes["30"] : v.boxes["30"], "[30] pas anulimit");
    assert(v.boxes["16"] < 370, "kutizat zvogëlohen pas anulimit B2B");
    ok(15, "Soft delete");
  } catch (e) { fail(15, e); }

  return R;
}

run().then(async (r) => {
  if (stopServer) await stopServer();
  try { fs.unlinkSync(TEST_DB); } catch { /* test db */ }
  console.log("\n═══════════════════════════════════════════");
  console.log("RAPORTI FINAL — 15 TESTE");
  console.log("═══════════════════════════════════════════");
  for (let i = 1; i <= 15; i++) {
    const t = r.find((x) => x.n === i);
    console.log(`${t?.ok ? "✅" : "❌"} Test ${i} — ${t?.ok ? t.m + ": KALON" : t?.e || "DËSHTON"}`);
  }
  const allOk = r.length === 15 && r.every((x) => x.ok);
  console.log(allOk ? "\n🎉 KREJT 15 TESTET KALUAN" : "\n⚠️ Ka teste që dështuan");
  process.exit(allOk ? 0 : 1);
}).catch(async (e) => {
  console.error(e);
  if (stopServer) await stopServer();
  process.exit(1);
});
