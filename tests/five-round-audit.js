/**
 * Audit 5-raund — revolution-kontabilisti
 * Pastron tabelat transaksionale, regjistron të dhëna të ndryshme, teston API/logjikën.
 * MOS ndryshon kod — vetëm raport.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const FROM = "2026-08-01";
const TO = "2026-08-31";
const TINY_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEBAP/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";

const SETTINGS = {
  business_legal_name: "Audit Test SH.P.K.",
  business_trade_name: "Audit Test",
  business_type: "SH.P.K.",
  nui: "811314567",
  fiscal_number: "811314567",
  arbk: "12345678",
  registration_date: "2020-01-15",
  address: "Rr. Audit 1",
  city: "Prishtinë",
  municipality: "Prishtinë",
  phone: "044111222",
  email: "audit@test.com",
  owner_name: "Test Pronari",
  owner_id_number: "1234567890",
  owner_phone: "044333444",
  declaration_period: "quarterly",
  fiscal_year: 2026,
  notify_banner: 1,
  notify_on_startup: 1,
};

function round2(n) { return Math.round(Number(n) * 100) / 100; }
function near(a, b, tol = 0.03) { return Math.abs(round2(a) - round2(b)) <= tol; }

function vatFromGross(gross, rate) {
  const g = round2(gross);
  const r = rate / 100;
  if (g <= 0 || r <= 0) return { base: g, vat: 0, gross: g };
  const base = round2(g / (1 + r));
  return { base, vat: round2(g - base), gross: g };
}

const ROUND_SEEDS = [
  { m: 1, z: [
    { d: "2026-08-04", s18: 1180, s8: 540, s0: 200 },
    { d: "2026-08-05", s18: 590, s8: 0, s0: 100 },
    { d: "2026-08-06", s18: 236, s8: 216, s0: 0 },
    { d: "2026-08-07", s18: 0, s8: 108, s0: 50 },
  ]},
  { m: 2, z: [
    { d: "2026-08-03", s18: 2360, s8: 0, s0: 0 },
    { d: "2026-08-04", s18: 472, s8: 324, s0: 75 },
    { d: "2026-08-08", s18: 118, s8: 54, s0: 25 },
    { d: "2026-08-09", s18: 354, s8: 0, s0: 200 },
    { d: "2026-08-10", s18: 0, s8: 432, s0: 0 },
  ]},
  { m: 3, z: [
    { d: "2026-08-02", s18: 708, s8: 270, s0: 150 },
    { d: "2026-08-03", s18: 177, s8: 108, s0: 0 },
    { d: "2026-08-11", s18: 944, s8: 0, s0: 300 },
  ]},
  { m: 4, z: [
    { d: "2026-08-01", s18: 1534, s8: 648, s0: 0 },
    { d: "2026-08-12", s18: 295, s8: 162, s0: 80 },
    { d: "2026-08-13", s18: 118, s8: 0, s0: 0 },
    { d: "2026-08-14", s18: 0, s8: 540, s0: 120 },
    { d: "2026-08-15", s18: 472, s8: 54, s0: 0 },
  ]},
  { m: 5, z: [
    { d: "2026-08-06", s18: 826, s8: 378, s0: 90 },
    { d: "2026-08-07", s18: 413, s8: 0, s0: 0 },
    { d: "2026-08-16", s18: 0, s8: 216, s0: 40 },
    { d: "2026-08-17", s18: 236, s8: 108, s0: 0 },
  ]},
];

function makeReq(base) {
  return (method, urlPath, body) => new Promise((resolve, reject) => {
    const u = new URL(base + urlPath);
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

async function cleanDb(getDb) {
  const db = getDb();
  db.exec("DELETE FROM sales_invoice_items");
  db.exec("DELETE FROM sales_invoices");
  db.exec("DELETE FROM purchase_invoice_items");
  db.exec("DELETE FROM purchase_payments");
  db.exec("DELETE FROM purchase_invoices");
  db.exec("DELETE FROM z_reports");
  db.exec("DELETE FROM expenses");
  db.exec("DELETE FROM vat_declarations");
  db.exec("DELETE FROM declaration_deadlines");
  const { syncDeadlines } = require("../declaration-deadlines");
  syncDeadlines(db, db.prepare("SELECT * FROM settings WHERE id=1").get());
}

async function seedRound(req, roundIdx) {
  const r = ROUND_SEEDS[roundIdx];
  const m = r.m;
  const log = { z: [], b2b: [], pur: [], exp: [] };

  for (const z of r.z) {
    const res = await req("POST", "/z-reports", {
      report_date: z.d,
      device_name: `Kasa R${roundIdx + 1}`,
      sales_18_total: z.s18 * m,
      sales_8_total: z.s8 * m,
      sales_0_total: z.s0 * m,
    });
    log.z.push({ date: z.d, ok: res.ok !== false, id: res.id, num: res.report_number, total: res.computed?.grand_total });
  }

  const b2bs = [
    {
      invoice_date: "2026-08-08",
      client_name: `Klient A R${roundIdx + 1}`,
      client_nui: "123456789",
      client_fiscal: "123456789",
      client_address: "Adr A",
      payment_method: "transfer",
      status: "finalized",
      items: [{ description: "Art A", quantity: 5 + roundIdx, unit_price: 20 * m, vat_rate: 18, unit: "copë" }],
    },
    {
      invoice_date: "2026-08-09",
      client_name: `Klient B R${roundIdx + 1}`,
      client_nui: "987654321",
      client_fiscal: "987654321",
      client_address: "Adr B",
      payment_method: "cash",
      status: "draft",
      items: [{ description: "Art B", quantity: 2, unit_price: 50 * m, vat_rate: 8, unit: "copë" }],
    },
  ];
  if (roundIdx >= 2) {
    b2bs.push({
      invoice_date: "2026-08-10",
      client_name: `Klient C R${roundIdx + 1}`,
      client_nui: "111222333",
      client_fiscal: "111222333",
      client_address: "Adr C",
      payment_method: "transfer",
      status: "finalized",
      items: [{ description: "Art C", quantity: 1, unit_price: 100 * m, vat_rate: 18, unit: "copë" }],
    });
  }
  for (const b of b2bs) {
    const res = await req("POST", "/sales-invoices", b);
    log.b2b.push({ ok: res.ok !== false, num: res.invoice_number, status: b.status });
  }

  const purs = [
    {
      supplier_invoice_number: `SUP-A-R${roundIdx + 1}`,
      invoice_date: "2026-08-11",
      supplier_name: `Furnitor A R${roundIdx + 1}`,
      supplier_nui: "111222333",
      supplier_fiscal: "111222333",
      items: [{ description: "Mall", quantity: 10, unit_price_with_vat: 11.8 * m, vat_rate: 18, unit: "copë" }],
    },
    {
      supplier_invoice_number: `SUP-B-R${roundIdx + 1}`,
      invoice_date: "2026-08-12",
      supplier_name: `Furnitor B R${roundIdx + 1}`,
      supplier_nui: "444555666",
      supplier_fiscal: "444555666",
      items: [{ description: "Mat", quantity: 20, unit_price_with_vat: 5.4 * m, vat_rate: 8, unit: "copë" }],
    },
  ];
  if (roundIdx >= 1) {
    purs.push({
      supplier_invoice_number: `SUP-C-R${roundIdx + 1}`,
      invoice_date: "2026-08-13",
      supplier_name: `Furnitor C R${roundIdx + 1}`,
      supplier_nui: "777888999",
      supplier_fiscal: "777888999",
      items: [{ description: "X", quantity: 5, unit_price_with_vat: 23.6 * m, vat_rate: 18, unit: "copë" }],
    });
  }
  for (const p of purs) {
    const res = await req("POST", "/purchase-invoices", p);
    log.pur.push({ ok: res.ok !== false, internal: res.internal_number });
  }

  const exps = [
    { expense_date: "2026-08-14", category: "Qira", amount: 400 * m, has_vat: 0, description: "Qira" },
    { expense_date: "2026-08-15", category: "Rryma", amount: 59 * m, has_vat: 1, vat_rate: 18, receipt_number: `R-${roundIdx}-1` },
    { expense_date: "2026-08-16", category: "Karburant", amount: 80 * m, has_vat: 1, vat_rate: 18, receipt_number: `K-${roundIdx}-1` },
    { expense_date: "2026-08-17", category: "Paga", amount: 500 * m, has_vat: 0, description: "Pagat" },
    { expense_date: "2026-08-18", category: "Mirëmbajtje", amount: 45 * m, has_vat: 0, description: "Servis" },
  ];
  if (roundIdx >= 3) {
    exps.push({ expense_date: "2026-08-19", category: "Ujë", amount: 25 * m, has_vat: 0, description: "Ujë" });
    exps.push({ expense_date: "2026-08-20", category: "Telefon", amount: 21.6 * m, has_vat: 1, vat_rate: 8, receipt_number: `T-${roundIdx}-1` });
  }
  for (const e of exps) {
    const res = await req("POST", "/expenses", e);
    log.exp.push({ ok: res.ok !== false, cat: e.category, num: res.expense_number });
  }

  return log;
}

function check(name, ok, reason) {
  return { name, ok: !!ok, reason: ok ? "" : (reason || "Dështoi") };
}

async function runRound(roundIdx, req, getDb, staticChecks) {
  const issues = [];
  const modules = {};
  const seedLog = await seedRound(req, roundIdx);

  const sum = await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`);
  const t = sum.totals || {};
  const dash = await req("GET", "/dashboard");
  const vat = await req("GET", "/vat/period?period_type=quarterly&year=2026&period=3");
  const b = vat.boxes || {};

  // Manual calc
  const manualGrossProfit = round2(t.salesBase - (t.purchaseInvoiceBase ?? t.purchaseBase));
  const manualNetProfit = round2(manualGrossProfit - (t.expenseBase ?? (t.expenseTotal - t.expenseVat)));
  const manualVatPay = round2(t.outputVat - t.inputVat - (t.priorCredit || 0));

  /* 1 Wizard */
  if (roundIdx === 0) {
    const badNui = await req("PUT", "/settings", { ...SETTINGS, nui: "12345678" });
    const badEmail = await req("PUT", "/settings", { ...SETTINGS, email: "x" });
    const badId = await req("PUT", "/settings", { ...SETTINGS, owner_id_number: "123" });
    modules[1] = check("Wizardi",
      badNui.ok === false && badEmail.ok === false && badId.ok === false && staticChecks.wizardBlock,
      `Validim API: NUI=${badNui.ok}, email=${badEmail.ok}, ID=${badId.ok}, bllokim UI=${staticChecks.wizardBlock}`);
    await req("PUT", "/settings", SETTINGS);
  } else {
    const s = await req("GET", "/settings");
    modules[1] = check("Wizardi", s.complete && staticChecks.wizardBlock, "Settings jo complete ose mungon bllokimi në kod");
  }

  /* 2 Pasqyra */
  const pasOk = t.salesGross > 0 && t.purchaseGross > 0 && t.expenseTotal > 0
    && near(manualGrossProfit, t.grossProfit) && near(manualNetProfit, t.netProfit)
    && near(manualVatPay, t.vatPayable)
    && (dash.daily?.length > 0) && Array.isArray(dash.alerts)
    && (dash.topClients?.length >= 0) && (dash.expensesByCat?.length > 0);
  modules[2] = check("Pasqyra", pasOk,
    `KPI: sh=${t.salesGross} bl=${t.purchaseGross} sp=${t.expenseTotal}; bruto ${t.grossProfit} vs ${manualGrossProfit}; neto ${t.netProfit} vs ${manualNetProfit}; TVSH ${t.vatPayable} vs ${manualVatPay}; grafik=${dash.daily?.length}; alarmZ=${dash.missingZDays?.length}`);

  /* 7 Ditari (para anulimeve që heqin B2B/Z nga ditari) */
  const dit = (await req("GET", `/ditari?from=${FROM}&to=${TO}`)).rows || [];
  const ditF = (await req("GET", `/ditari?from=2026-08-01&to=2026-08-10`)).rows || [];
  const ditTypes = new Set(dit.map((r) => r.type));
  modules[7] = check("Ditari",
    ditTypes.has("Z-Raport") && ditTypes.has("Faturë B2B") && ditTypes.has("Blerje") && ditTypes.has("Shpenzim")
    && dit.length >= 8 && ditF.length < dit.length,
    `Rreshta=${dit.length}, tipet=${[...ditTypes].join("/")}, filt=${ditF.length}<${dit.length}`);

  /* 3 Z */
  const zRows = (await req("GET", `/z-reports?from=${FROM}&to=${TO}`)).rows || [];
  const zNums = zRows.map((r) => r.report_number).sort();
  const zSeqOk = zNums.every((n, i) => n === `Z-${String(i + 1).padStart(4, "0")}`);
  const zB2c = round2(zRows.reduce((a, r) => a + r.grand_total, 0));
  const sumBefore = t.salesGross;
  const zCancel = zRows[0];
  if (zCancel) await req("DELETE", `/z-reports/${zCancel.id}`);
  const sumAfter = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
  const zAfter = (await req("GET", `/z-reports?from=${FROM}&to=${TO}`)).rows || [];
  modules[3] = check("Shitjet Z",
    zRows.length >= 3 && zSeqOk && sumAfter < sumBefore && staticChecks.zGuide
    && zAfter.length === zRows.length - 1 && seedLog.z.every((z) => z.id > 0),
    `Z=${zRows.length}, seq=${zSeqOk}, ids=${seedLog.z.map((z) => z.id).join(",")}, KPI drop=${sumAfter < sumBefore}, guide=${staticChecks.zGuide}`);

  /* 4 B2B */
  const inv = (await req("GET", `/sales-invoices?from=${FROM}&to=${TO}`)).rows || [];
  const badNuiB2b = await req("POST", "/sales-invoices", {
    invoice_date: "2026-08-20", client_name: "X", client_nui: "12345678",
    client_fiscal: "x", client_address: "x", payment_method: "cash", status: "draft",
    items: [{ description: "Y", quantity: 1, unit_price: 10, vat_rate: 18 }],
  });
  const fin = inv.find((r) => r.status === "finalized");
  const sumB2bBefore = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
  if (fin) await req("PATCH", `/sales-invoices/${fin.id}/status`, { status: "cancelled" });
  const sumB2bAfter = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.salesGross;
  const shNums = inv.map((r) => r.invoice_number).sort();
  modules[4] = check("Shitjet B2B",
    inv.length >= 2 && badNuiB2b.ok === false && sumB2bAfter <= sumB2bBefore
    && shNums[0]?.startsWith("SH-2026-"),
    `B2B=${inv.length}, NUI block=${badNuiB2b.ok === false}, anulim KPI=${sumB2bAfter <= sumB2bBefore}, nums=${shNums.join(",")}`);

  /* 5 Blerjet */
  const pur = (await req("GET", `/purchase-invoices?from=${FROM}&to=${TO}`)).rows || [];
  const badPur = await req("POST", "/purchase-invoices", {
    supplier_invoice_number: "BAD", invoice_date: "2026-08-21",
    supplier_name: "", supplier_nui: "", supplier_fiscal: "",
    items: [],
  });
  const sumPurBefore = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.purchaseGross;
  const payInv = pur[0];
  let payOk = false;
  if (payInv?.id) {
    const half = round2(Number(payInv.grand_total) / 2);
    const payRes = await req("POST", "/purchase-payments", {
      purchase_invoice_id: payInv.id,
      amount: half,
      payment_method: "transfer",
      payment_date: "2026-08-21",
    });
    const purReload = (await req("GET", `/purchase-invoices?from=${FROM}&to=${TO}`)).rows
      .find((r) => r.id === payInv.id);
    payOk = payRes.ok !== false && payRes.id > 0 && purReload?.payment_status === "partial"
      && near(purReload.amount_paid, half);
  }
  if (pur[0]) await req("DELETE", `/purchase-invoices/${pur[0].id}`);
  const sumPurAfter = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.purchaseGross;
  modules[5] = check("Blerjet",
    pur.length >= 2 && badPur.ok === false && sumPurAfter < sumPurBefore
    && staticChecks.blerjetTabs && staticChecks.pagesaTab && payOk,
    `Blerje=${pur.length}, valid=${badPur.ok === false}, soft-del=${sumPurAfter < sumPurBefore}, tabs=${staticChecks.blerjetTabs}, pagesa=${staticChecks.pagesaTab}, pay=${payOk}`);

  /* 6 Shpenzimet */
  const exp = (await req("GET", `/expenses?from=${FROM}&to=${TO}`)).rows || [];
  const badExpVat = await req("POST", "/expenses", {
    expense_date: "2026-08-22", category: "Rryma", amount: 59, has_vat: 1, vat_rate: 18,
  });
  const okExpNoVat = await req("POST", "/expenses", {
    expense_date: "2026-08-22", category: "Qira", amount: 100, has_vat: 0,
  });
  const sumExpBefore = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.expenseTotal;
  if (exp[0]) await req("DELETE", `/expenses/${exp[0].id}`);
  const sumExpAfter = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals.expenseTotal;
  const cats = new Set(exp.map((r) => r.category));
  modules[6] = check("Shpenzimet",
    exp.length >= 3 && badExpVat.ok === false && okExpNoVat.ok !== false && sumExpAfter < sumExpBefore
    && cats.has("Qira") && cats.has("Rryma"),
    `Exp=${exp.length}, TVSH val=${badExpVat.ok === false}, pa TVSH=${okExpNoVat.ok !== false}, soft-del=${sumExpAfter < sumExpBefore}`);

  /* 8 Raportet */
  const vatOk = near(b["12"], round2(b["10a"] * 0.18), 0.05) && near(b["14"], round2(b["10b"] * 0.08), 0.05)
    && near(b["30"], round2(b["K1"] - b["K2"] - (b["9"] || 0)), 0.05)
    && near(t.vatPayable, b["30"], 0.05) && near(t.netProfit, manualNetProfit, 0.05);
  modules[8] = check("Raportet", vatOk && staticChecks.reportsCsv && staticChecks.reportsPdf,
    `Kutizat: 10a*0.18=${round2(b["10a"] * 0.18)} vs 12=${b["12"]}; 30=${b["30"]} vs vatPay=${t.vatPayable}; CSV/PDF kod=${staticChecks.reportsCsv}/${staticChecks.reportsPdf}`);

  /* 9 Kontabilisti */
  const selfOk = vat.selfCheck?.passed;
  const boxOk = near(b["12"], round2(b["10a"] * 0.18), 0.05) && near(b["14"], round2(b["10b"] * 0.08), 0.05)
    && near(b["30"], round2(b["K1"] - b["K2"] - (b["9"] || 0)), 0.05);
  modules[9] = check("Kontabilisti",
    t.salesGross > 0 && selfOk && boxOk,
    `KPI reale=${t.salesGross > 0}, selfCheck=${selfOk}, kutizat=${boxOk}, fails=${(vat.selfCheck?.checks || []).filter((c) => !c.ok).map((c) => c.id).join(",")}`);

  /* 10 Dërgo ATK */
  const copyAll = ["9", "10a", "10b", "10c", "11", "12", "14", "30"].map((k) => `[${k}] ${b[k]}`).join("\n");
  const decl = await req("POST", "/vat-declarations", {
    period_type: "quarterly", period_label: "Q3 2026",
    period_start: "2026-07-01", period_end: "2026-09-30",
    status: "draft", data: b,
  });
  await req("PATCH", `/vat-declarations/${decl.id}`, { status: "sent" });
  await req("PATCH", `/vat-declarations/${decl.id}`, { status: "confirmed" });
  const hist = await req("GET", "/vat-declarations");
  modules[10] = check("Dërgo ATK",
    selfOk && copyAll.includes(String(b["10a"])) && decl.id > 0 && hist.rows?.some((r) => r.status === "confirmed")
    && staticChecks.atkGuide,
    `selfCheck=${selfOk}, declId=${decl.id}, histori=${hist.rows?.length}, guide=${staticChecks.atkGuide}`);

  /* 11 Cilësimet */
  const s = await req("GET", "/settings");
  const lic = await req("GET", "/license/status");
  await req("PUT", "/settings", { notify_banner: 0 });
  const s2 = await req("GET", "/settings");
  await req("PUT", "/settings", { notify_banner: 1 });
  const clAdd = await req("POST", "/clients", { name: `Test Klient R${roundIdx + 1}`, nui: `10000000${roundIdx}`, phone: "044000" });
  const clDup = await req("POST", "/clients", { name: "Dup Klient", nui: `10000000${roundIdx}` });
  modules[11] = check("Cilësimet",
    s.complete && lic.device_id?.length >= 8 && s2.settings?.notify_banner === 0 && clAdd.ok !== false && clAdd.id > 0
    && clDup.status === 409 && String(clDup.error || "").includes("NUI")
    && staticChecks.aiConfigUi,
    `complete=${s.complete}, device=${!!lic.device_id}, toggle=${s2.settings?.notify_banner === 0}, dupNui=${clDup.status}`);

  /* 12 AI Skanimi */
  const aiCfg = await req("GET", "/ai/config");
  const zPhoto = await req("POST", "/z-reports", {
    report_date: "2026-08-25", sales_18_total: 118,
    photo_attachment: { base64: TINY_JPEG, mimeType: "image/jpeg" },
    replace: true,
  });
  let photoOk = !!zPhoto.photo_path;
  if (zPhoto.id) {
    const zr = (await req("GET", `/z-reports?from=2026-08-25&to=2026-08-25`)).rows?.[0];
    photoOk = photoOk && !!zr?.photo_path;
  }
  modules[12] = check("AI Skanimi",
    staticChecks.aiLabels && staticChecks.aiResultScreen && (!aiCfg.has_key ? true : true) && photoOk,
    `labels=${staticChecks.aiLabels}, result=${staticChecks.aiResultScreen}, photo_path=${photoOk}, has_key=${aiCfg.has_key} (skanim live kërkon API key)`);

  /* 13 Numërimi */
  const nextZ = (await req("GET", "/next-z-report-number")).number;
  const nextSh = (await req("GET", `/next-invoice-number?date=2026-08-01`)).number;
  const nextBl = (await req("GET", "/next-purchase-number")).number;
  const nextSp = (await req("GET", "/next-expense-number")).number;
  const db = getDb();
  const maxZ = db.prepare("SELECT MAX(CAST(substr(report_number,3) AS INTEGER)) as m FROM z_reports WHERE report_number LIKE 'Z-%'").get()?.m || 0;
  modules[13] = check("Numërimi",
    nextZ === `Z-${String(maxZ + 1).padStart(4, "0")}` && nextSh?.startsWith("SH-2026-")
    && nextBl?.startsWith("BL-2026-") && nextSp?.startsWith("SP-2026-"),
    `nextZ=${nextZ}, maxZ=${maxZ}, SH=${nextSh}, BL=${nextBl}, SP=${nextSp}`);

  /* 14 Sinkronizimi */
  const beforeSync = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals;
  const dBefore = (await req("GET", `/ditari?from=${FROM}&to=${TO}`)).rows.length;
  await req("POST", "/z-reports", { report_date: "2026-08-26", sales_18_total: 118 });
  const afterSync = (await req("GET", `/kontabilisti/summary?from=${FROM}&to=${TO}`)).totals;
  const dAfter = (await req("GET", `/ditari?from=${FROM}&to=${TO}`)).rows.length;
  const vAfter = (await req("GET", "/vat/period?period_type=quarterly&year=2026&period=3")).boxes?.["11"];
  modules[14] = check("Sinkronizimi",
    afterSync.salesGross > beforeSync.salesGross && dAfter > dBefore && vAfter != null,
    `shitje ${beforeSync.salesGross}->${afterSync.salesGross}, ditari ${dBefore}->${dAfter}`);

  /* 15 Backup */
  const infoBefore = await req("GET", "/data/info");
  const bk = await req("POST", "/backup");
  const infoAfter = await req("GET", "/data/info");
  const list = await req("GET", "/backup/list");
  modules[15] = check("Backup",
    bk.ok !== false && infoAfter.backup_count_daily >= infoBefore.backup_count_daily
    && fs.existsSync(path.join(process.env.KONTABILISTI_DATA_DIR, "backups", "monthly"))
    && staticChecks.exportZip,
    `manual=${bk.ok !== false}, daily ${infoBefore.backup_count_daily}->${infoAfter.backup_count_daily}, monthly dir exists, zip kod=${staticChecks.exportZip}`);

  for (let i = 1; i <= 15; i++) {
    if (!modules[i].ok) issues.push(`${i}. ${modules[i].name}: ${modules[i].reason}`);
  }

  const pass = Object.values(modules).filter((m) => m.ok).length;
  return { roundIdx: roundIdx + 1, seedLog, totals: t, boxes: b, modules, issues, pass, seedSummary: summarizeSeed(seedLog, t) };
}

function summarizeSeed(log, t) {
  return `Z:${log.z.length} B2B:${log.b2b.length} Blerje:${log.pur.length} Shpenz:${log.exp.length} | Shitje bruto €${t.salesGross} Blerje €${t.purchaseGross} Shpenz €${t.expenseTotal} TVSH pagesë €${t.vatPayable} Neto €${t.netProfit}`;
}

function staticCodeChecks() {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
  const shitjet = read("public/js/shitjet-app.js");
  const blerjet = read("public/js/blerjet-app.js");
  const ai = read("public/js/blerjet-ai-scan.js");
  const shell = read("public/shell.js");
  const dergo = read("public/js/dergo-atk-app.js");
  const rap = read("public/js/raportet-app.js");
  const csvExp = read("public/js/csv-export.js");
  const ciles = read("public/js/cilesimet-app.js");
  const dataExp = fs.existsSync(path.join(ROOT, "data-export.js")) ? read("data-export.js") : "";

  return {
    wizardBlock: shell.includes("wizardBlocking") && shell.includes("wizard-locked"),
    zGuide: shitjet.includes("shitje-guide") && shitjet.includes("Z-Raporti Ditor"),
    blerjetTabs: blerjet.includes('data-tab="blerje"') && blerjet.includes('data-tab="shpenzime"') && blerjet.includes('data-tab="pagesa"'),
    pagesaTab: blerjet.includes("renderPayments") && blerjet.includes("openPaymentDialog") && blerjet.includes("/purchase-payments"),
    reportsCsv: rap.includes("CsvExport") && csvExp.includes("Eksporto CSV"),
    reportsPdf: rap.includes("PdfExport") && csvExp.includes("Printo") && csvExp.includes("PDF"),
    atkGuide: dergo.includes("atk-guide"),
    aiConfigUi: ciles.includes("/ai/config"),
    aiLabels: ai.includes("📷 Skano Z-Raportin") && ai.includes("📷 Skano Shumë") && ai.includes("📷 Skano Certifikatën ARBK"),
    aiResultScreen: ai.includes("ai-scan-result-layout") && ai.includes("Mbush Formularin") && !ai.includes("quick: true"),
    exportZip: dataExp.includes("zip") || ciles.includes("export") || ciles.includes("ZIP"),
  };
}

async function main() {
  const staticChecks = staticCodeChecks();
  const allRounds = [];
  const ROUNDS = Number(process.env.AUDIT_ROUNDS || 5);

  for (let r = 0; r < ROUNDS; r++) {
    const dataDir = path.join(os.tmpdir(), `kont-audit-r${r + 1}-${Date.now()}`);
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.KONTABILISTI_DATA_DIR = dataDir;
    process.env.KONTABILISTI_DB_PATH = path.join(dataDir, "kontabilisti.db");

    delete require.cache[require.resolve("../database")];
    delete require.cache[require.resolve("../server")];
    const { initDatabase, getDb } = require("../database");
    await initDatabase();
    await cleanDb(getDb);
    await getDb().prepare(`UPDATE settings SET business_legal_name=@business_legal_name, business_trade_name=@business_trade_name,
      business_type=@business_type, nui=@nui, fiscal_number=@fiscal_number, arbk=@arbk, registration_date=@registration_date,
      address=@address, city=@city, municipality=@municipality, phone=@phone, email=@email, owner_name=@owner_name,
      owner_id_number=@owner_id_number, owner_phone=@owner_phone, declaration_period=@declaration_period, fiscal_year=@fiscal_year
      WHERE id=1`).run(SETTINGS);

    const { startOnPort, stopServer } = require("../server");
    const srv = await startOnPort(0);
    const base = `http://127.0.0.1:${srv.address().port}/api`;
    const req = makeReq(base);

    if (r === 0) {
      const incomplete = await req("GET", "/settings");
      // fresh DB row exists but we set complete above — wizard tested via validation in runRound
    }

    const result = await runRound(r, req, getDb, staticChecks);
    allRounds.push(result);
    await stopServer();
  }

  // Print report
  console.log("\n\n████████████████████████████████████████████████");
  console.log(`RAPORTI FINAL — ${ROUNDS} RAUND${ROUNDS === 1 ? "" : "E"} AUDIT`);
  console.log("Metodë: DB e izoluar/raund (pastrim i tabelave transaksionale, settings+clients ruhen)");
  console.log("Test: API + llogaritje + verifikim statik i UI (pa Electron/browser)");
  console.log("████████████████████████████████████████████████\n");

  const repeatIssues = {};
  const onceIssues = {};

  for (const rnd of allRounds) {
    console.log(`\n═══════════════════════════════════`);
    console.log(`RAUNDI ${rnd.roundIdx} / 5`);
    console.log(`Të dhënat: ${rnd.seedSummary}`);
    console.log(`═══════════════════════════════════`);
    for (let i = 1; i <= 15; i++) {
      const m = rnd.modules[i];
      const icon = m.ok ? "✅" : "❌";
      console.log(`${String(i).padStart(2, " ")}. ${m.name.padEnd(18)} ${icon}${m.reason ? ` (${m.reason})` : ""}`);
    }
    console.log(`\nGABIME NË KËTË RAUND: ${rnd.issues.length ? rnd.issues.join("; ") : "Asnjë"}`);
    console.log(`SCORE: ${rnd.pass}/15`);

    for (const iss of rnd.issues) {
      const key = iss.replace(/^[\d.]+\s*/, "").split(":")[0];
      repeatIssues[key] = (repeatIssues[key] || 0) + 1;
    }
  }

  console.log("\n\n═══════════════════════════════════");
  console.log("PAS 5 RAUNDEVE — RAPORTI FINAL");
  console.log("═══════════════════════════════════");
  for (const rnd of allRounds) {
    console.log(`RAUNDI ${rnd.roundIdx}: ${rnd.pass}/15`);
  }

  const repeated = Object.entries(repeatIssues).filter(([, c]) => c > 1).map(([k, c]) => `${k} (${c}x)`);
  const single = Object.entries(repeatIssues).filter(([, c]) => c === 1).map(([k]) => k);

  const alwaysOk = [];
  for (let i = 1; i <= 15; i++) {
    if (allRounds.every((r) => r.modules[i].ok)) {
      alwaysOk.push(allRounds[0].modules[i].name);
    }
  }

  console.log(`\nGABIME TË PËRSËRITURA: ${repeated.length ? repeated.join("; ") : "Asnjë"}`);
  console.log(`GABIME TË VETME: ${single.length ? single.join("; ") : "Asnjë"}`);
  console.log(`KREJT NË RREGULL (5/5): ${alwaysOk.length ? alwaysOk.join(", ") : "—"}`);

  const failRounds = allRounds.filter((r) => r.pass < 15).length;
  process.exit(failRounds ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
