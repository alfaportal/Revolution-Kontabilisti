/**
 * Test vetëm Kontabilisti — API + logjikë ATK (pa build, pa UI)
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `kontabilisti-only-${Date.now()}.db`);
process.env.KONTABILISTI_DB_PATH = TEST_DB;

const FROM = "2026-08-01";
const TO = "2026-08-30";
const TODAY = "2026-08-30";

function req(method, urlPath, body, base) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(u, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : null),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf || "{}") }); }
        catch { resolve({ status: res.statusCode, data: { raw: buf } }); }
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

function loadKontAtk() {
  const code = fs.readFileSync(path.join(__dirname, "../public/js/kontabilisti-atk.js"), "utf8");
  return new Function("console", `${code}; return KONT_ATK;`)(console);
}

function near(a, b) {
  assert(Math.round(Number(a) * 100) === Math.round(Number(b) * 100), `${a} vs ${b}`);
}

async function run() {
  const results = [];
  const pass = (id, msg) => { results.push({ id, ok: true, msg }); console.log(`OK  ${id}: ${msg}`); };
  const fail = (id, msg) => { results.push({ id, ok: false, msg }); console.log(`FAIL ${id}: ${msg}`); };

  /* ── 1. Skedarët ekzistojnë ── */
  try {
    for (const f of ["public/js/kontabilisti-atk.js", "public/js/kontabilisti-app.js", "public/css/kontabilisti-ui.css"]) {
      assert(fs.existsSync(path.join(__dirname, "..", f)), `Mungon ${f}`);
    }
    const appJs = fs.readFileSync(path.join(__dirname, "../public/js/kontabilisti-app.js"), "utf8");
    const hubIds = ["bilanc", "shitje-tvsh", "blerje-tvsh", "kuartale", "deklarata", "shpenzime", "paga", "qera", "tremujor", "vjetore"];
    for (const id of hubIds) assert(appJs.includes(`id: "${id}"`), `Hub mungon: ${id}`);
    for (const fn of hubIds.map((id) => `section${id.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("")}`)) {
      /* section names vary — check data-sec or fns map */
    }
    assert(appJs.includes("sectionBilanc"), "sectionBilanc");
    assert(appJs.includes("sectionDeklarata"), "sectionDeklarata");
    assert(appJs.includes("sectionPaga"), "sectionPaga");
    assert(appJs.includes("KONT_ATK"), "KONT_ATK i lidhur");
    pass("K1", "10 seksione + skedarët OK");
  } catch (e) { fail("K1", e.message); }

  /* ── 2. KONT_ATK logjikë ── */
  try {
    const ATK = loadKontAtk();
    const sales = ATK.salesBoxesFromTotals({ salesBase18: 336.81, salesVat18: 60.63, outputVat: 60.63 }, { 9: 0, "10c": 0 });
    assert(sales.box12 === 336.81, "box12");
    assert(sales.boxK1 === 60.63, "boxK1");
    const purch = ATK.purchaseBoxesFromTotals({ purchaseBase: 0, inputVat: 0 });
    const decl = ATK.buildVatDeclaration(sales, purch);
    assert(Object.keys(decl.boxes).length >= 35, `Deklarata duhet ≥35 kutiza, ka ${Object.keys(decl.boxes).length}`);
    near(decl.vat_payable, 60.63);
    const payroll = ATK.payrollFromSalesGross(397.44, { owner_name: "Naser Buzhala", owner_id_number: "292767" });
    assert(payroll.length === 1 && payroll[0].gross === 397.44, "payroll nga shitjet");
    const wh = ATK.buildWithholdingTaxFromPayroll(payroll);
    assert(wh["[8] Pagat bruto"] === 397.44, "withholding bruto");
    pass("K2", "KONT_ATK: deklarata, pagat, TVSH OK");
  } catch (e) { fail("K2", e.message); }

  /* ── 3. API me të dhëna reale test ── */
  let stopServer = null;
  let BASE = "";
  try {
    const { startOnPort, stopServer: stop } = require("../server");
    stopServer = stop;
    const srv = await startOnPort(0);
    BASE = `http://127.0.0.1:${srv.address().port}/api`;

    await req("PUT", "/settings", {
      business_legal_name: "Secutity-Naser",
      business_trade_name: "Security POS",
      business_type: "SH.P.K.",
      nui: "811314567",
      fiscal_number: "811314567",
      arbk: "12345678",
      registration_date: "2018-01-01",
      address: "Rr. Test",
      city: "Ferizaj",
      municipality: "Ferizaj",
      phone: "044123456",
      email: "naser@test.com",
      owner_name: "Naser Buzhala",
      owner_id_number: "1234567890",
      owner_phone: "044654321",
      fiscal_year: 2026,
      declaration_period: "quarterly",
    }, BASE);

    await req("POST", "/z-reports", {
      report_date: "2026-08-18",
      report_number: "EV-20260818",
      sales_18_total: 392.39,
    }, BASE);
    await req("POST", "/z-reports", {
      report_date: "2026-08-17",
      report_number: "EV-20260817",
      sales_18_total: 4.82,
    }, BASE);
    await req("POST", "/z-reports", {
      report_date: "2026-08-25",
      report_number: "EV-20260825",
      sales_18_total: 0.24,
    }, BASE);

    const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`, null, BASE);
    assert(sum.data.ok, "summary ok");
    assert(sum.data.totals, "totals");
    assert(sum.data.boxes, "boxes");
    assert(sum.data.totals.salesGross > 0, "ka shitje");
    pass("K3", `Summary: shitje=${sum.data.totals.salesGross}, TVSH dalë=${sum.data.totals.outputVat}`);

    const z = await req("GET", `/z-reports?from=${FROM}&to=${TO}`, null, BASE);
    assert(z.data.rows?.length >= 3, "z-reports");
    pass("K4", `Libri Shitjes API: ${z.data.rows.length} rreshta`);

    const pur = await req("GET", `/purchase-invoices?from=${FROM}&to=${TO}`, null, BASE);
    assert(pur.data.ok, "purchase ok");
    pass("K5", `Libri Blerjes API: ${(pur.data.rows || []).length} fatura`);

    const ex = await req("GET", `/expenses?from=${FROM}&to=${TO}`, null, BASE);
    assert(ex.data.ok, "expenses ok");
    pass("K6", `Shpenzimet API: ${(ex.data.rows || []).length} rreshta`);

    const inv = await req("GET", `/sales-invoices?from=${FROM}&to=${TO}&status=finalized`, null, BASE);
    assert(inv.data.ok, "sales inv ok");
    pass("K7", `Fatura shitje API OK`);

    const annual = await req("GET", `/kontabilisti/summary?from=2026-01-01&to=2026-12-31`, null, BASE);
    assert(annual.data.ok, "annual summary");
    pass("K8", `Pasqyra vjetore API: shitje vit=${annual.data.totals.salesGross}`);

    /* TVSH payable konsistencë */
    const ATK = loadKontAtk();
    const t = sum.data.totals;
    const b = sum.data.boxes;
    const sb = ATK.salesBoxesFromTotals(t, b);
    const pb = ATK.purchaseBoxesFromTotals(t);
    const decl = ATK.buildVatDeclaration(sb, pb);
    assert(decl.vat_payable === ATK.money(t.outputVat - t.inputVat), "TVSH payable = dalë - hyrë");
    pass("K9", `Deklarata TVSH: për pagesë=${decl.vat_payable} €`);

  } catch (e) {
    fail("K3-K9", e.message);
  } finally {
    if (stopServer) stopServer();
    try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n---");
  console.log(`Rezultat: ${results.length - failed.length}/${results.length} OK`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.id}: ${f.msg}`));
    process.exit(1);
  }
  console.log("Kontabilisti funksionon si duhet (API + logjikë).");
}

run().catch((e) => { console.error(e); process.exit(1); });
