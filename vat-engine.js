/**
 * Llogaritjet TVSH dhe kutizat zyrtare ATK — burim i vetëm matematikor.
 */

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function vatFromGross(gross, ratePct) {
  const rate = Number(ratePct) / 100;
  const g = round2(gross);
  if (g <= 0 || rate <= 0) return { base: g, vat: 0, gross: g };
  const base = round2(g / (1 + rate));
  const vat = round2(g - base);
  return { base, vat, gross: g };
}

function vatFromNet(net, ratePct) {
  const rate = Number(ratePct) / 100;
  const base = round2(net);
  const vat = round2(base * rate);
  return { base, vat, gross: round2(base + vat) };
}

function splitZReport(row) {
  const s18 = vatFromGross(row.sales_18_total || 0, 18);
  const s8 = vatFromGross(row.sales_8_total || 0, 8);
  const s0 = { base: round2(row.sales_0_total || 0), vat: 0, gross: round2(row.sales_0_total || 0) };
  return { s18, s8, s0 };
}

function periodBounds(periodType, year, monthOrQuarter) {
  const y = Number(year);
  if (periodType === "monthly") {
    const m = Number(monthOrQuarter);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(y, m, 0);
    const end = `${y}-${String(m).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    const label = `${String(m).padStart(2, "0")}/${y}`;
    return { start, end, label, periodType: "monthly", year: y, period: m };
  }
  if (periodType === "yearly") {
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}`, periodType: "yearly", year: y, period: 1 };
  }
  const q = Number(monthOrQuarter);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const start = `${y}-${String(startMonth).padStart(2, "0")}-01`;
  const endDate = new Date(y, endMonth, 0);
  const end = `${y}-${String(endMonth).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  const label = `Q${q}/${y}`;
  return { start, end, label, periodType: "quarterly", year: y, period: q };
}

function previousPeriodBounds(start, periodType) {
  const d = new Date(start);
  if (periodType === "monthly") {
    d.setMonth(d.getMonth() - 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return periodBounds("monthly", y, m);
  }
  if (periodType === "yearly") {
    return periodBounds("yearly", d.getFullYear() - 1, 1);
  }
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const q = Math.ceil(m / 3);
  const prevQ = q === 1 ? 4 : q - 1;
  const prevY = q === 1 ? y - 1 : y;
  return periodBounds("quarterly", prevY, prevQ);
}

function getPriorVatCredit(db, start, periodType) {
  const prev = previousPeriodBounds(start, periodType || "quarterly");
  const t = computePeriodTotals(db, prev.start, prev.end, periodType, 0, true);
  const raw = round2(t.outputVat - t.inputVat);
  return raw < 0 ? round2(Math.abs(raw)) : 0;
}

function computePeriodTotals(db, start, end, periodType, priorCreditOverride, skipPriorLookup) {
  const zRows = db.prepare(
    `SELECT * FROM z_reports WHERE status='active' AND report_date BETWEEN ? AND ?`
  ).all(start, end);

  let zBase18 = 0, zVat18 = 0, zBase8 = 0, zVat8 = 0, zBase0 = 0, zGross = 0;
  for (const r of zRows) {
    const { s18, s8, s0 } = splitZReport(r);
    zBase18 += s18.base; zVat18 += s18.vat;
    zBase8 += s8.base; zVat8 += s8.vat;
    zBase0 += s0.base;
    zGross += s18.gross + s8.gross + s0.gross;
  }

  const b2b = db.prepare(
    `SELECT COALESCE(SUM(subtotal),0) as sub, COALESCE(SUM(vat_18),0) as v18,
            COALESCE(SUM(vat_8),0) as v8, COALESCE(SUM(vat_0_base),0) as b0,
            COALESCE(SUM(grand_total),0) as gt
     FROM sales_invoices WHERE status='finalized' AND invoice_date BETWEEN ? AND ?`
  ).get(start, end);

  const purchItems = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN pi.vat_rate=18 AND (p.vat_deductible IS NULL OR p.vat_deductible=1) THEN pi.base_price ELSE 0 END),0) as b18,
            COALESCE(SUM(CASE WHEN pi.vat_rate=8 AND (p.vat_deductible IS NULL OR p.vat_deductible=1) THEN pi.base_price ELSE 0 END),0) as b8,
            COALESCE(SUM(CASE WHEN pi.vat_rate=18 AND (p.vat_deductible IS NULL OR p.vat_deductible=1) THEN pi.vat_amount ELSE 0 END),0) as v18,
            COALESCE(SUM(CASE WHEN pi.vat_rate=8 AND (p.vat_deductible IS NULL OR p.vat_deductible=1) THEN pi.vat_amount ELSE 0 END),0) as v8
     FROM purchase_invoice_items pi
     JOIN purchase_invoices p ON p.id = pi.invoice_id
     WHERE p.status='active' AND p.invoice_date BETWEEN ? AND ?`
  ).get(start, end);

  const purchases = db.prepare(
    `SELECT COALESCE(SUM(subtotal),0) as sub, COALESCE(SUM(grand_total),0) as gt
     FROM purchase_invoices WHERE status='active' AND invoice_date BETWEEN ? AND ?`
  ).get(start, end);

  const expenses = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as amt, COALESCE(SUM(vat_amount),0) as vt,
            COALESCE(SUM(CASE WHEN vat_rate=18 AND receipt_number IS NOT NULL AND receipt_number != '' THEN vat_amount ELSE 0 END),0) as v18,
            COALESCE(SUM(CASE WHEN vat_rate=8 AND receipt_number IS NOT NULL AND receipt_number != '' THEN vat_amount ELSE 0 END),0) as v8,
            COALESCE(SUM(CASE WHEN vat_rate=18 AND receipt_number IS NOT NULL AND receipt_number != '' THEN amount - vat_amount ELSE 0 END),0) as b18,
            COALESCE(SUM(CASE WHEN vat_rate=8 AND receipt_number IS NOT NULL AND receipt_number != '' THEN amount - vat_amount ELSE 0 END),0) as b8
     FROM expenses WHERE status='active' AND expense_date BETWEEN ? AND ?`
  ).get(start, end);

  const b2bItems = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN si.vat_rate = 18 THEN si.quantity * si.unit_price ELSE 0 END), 0) as b18,
            COALESCE(SUM(CASE WHEN si.vat_rate = 8 THEN si.quantity * si.unit_price ELSE 0 END), 0) as b8,
            COALESCE(SUM(CASE WHEN si.vat_rate = 0 THEN si.quantity * si.unit_price ELSE 0 END), 0) as b0
     FROM sales_invoice_items si
     JOIN sales_invoices inv ON inv.id = si.invoice_id
     WHERE inv.status = 'finalized' AND inv.invoice_date BETWEEN ? AND ?`
  ).get(start, end);

  const salesBase18 = round2(zBase18 + (b2bItems.b18 || 0));
  const salesBase8 = round2(zBase8 + (b2bItems.b8 || 0));
  const salesVat0Base = round2(zBase0 + (b2bItems.b0 || 0));
  const salesVat18 = round2(zVat18 + (b2b.v18 || 0));
  const salesVat8 = round2(zVat8 + (b2b.v8 || 0));
  const salesBase = round2(salesBase18 + salesBase8 + salesVat0Base);
  const salesVatTotal = round2(salesVat18 + salesVat8);
  const salesGross = round2(zGross + (b2b.gt || 0));

  const purchaseInvoiceBase18 = round2(purchItems.b18 || 0);
  const purchaseInvoiceBase8 = round2(purchItems.b8 || 0);
  const purchaseInvoiceBase = round2(purchaseInvoiceBase18 + purchaseInvoiceBase8);

  const purchaseBase18 = round2(purchaseInvoiceBase18 + (expenses.b18 || 0));
  const purchaseBase8 = round2(purchaseInvoiceBase8 + (expenses.b8 || 0));
  const purchaseBase = round2(purchaseBase18 + purchaseBase8);
  const purchaseVat18 = round2((purchItems.v18 || 0) + (expenses.v18 || 0));
  const purchaseVat8 = round2((purchItems.v8 || 0) + (expenses.v8 || 0));
  const purchaseVatTotal = round2(purchaseVat18 + purchaseVat8);
  const purchaseGross = round2(purchases.gt || 0);

  const expenseTotal = round2(expenses.amt || 0);
  const expenseVat = round2(expenses.vt || 0);
  const expenseVat18 = round2(expenses.v18 || 0);
  const expenseVat8 = round2(expenses.v8 || 0);
  const expenseBase = round2(expenseTotal - expenseVat);

  const outputVat = salesVatTotal;
  const inputVat = purchaseVatTotal;
  const priorCredit = priorCreditOverride != null
    ? round2(priorCreditOverride)
    : (skipPriorLookup ? 0 : getPriorVatCredit(db, start, periodType));

  const vatPayable = round2(outputVat - inputVat - priorCredit);
  const grossProfit = round2(salesBase - purchaseInvoiceBase);
  const netProfit = round2(grossProfit - expenseBase);

  const purchaseCount = db.prepare(
    `SELECT COUNT(*) as c FROM purchase_invoices WHERE status='active' AND invoice_date BETWEEN ? AND ?`
  ).get(start, end).c;
  const expenseCount = db.prepare(
    `SELECT COUNT(*) as c FROM expenses WHERE status='active' AND expense_date BETWEEN ? AND ?`
  ).get(start, end).c;
  const b2bCount = db.prepare(
    `SELECT COUNT(*) as c FROM sales_invoices WHERE status='finalized' AND invoice_date BETWEEN ? AND ?`
  ).get(start, end).c;

  return {
    zReports: zRows.length,
    b2bCount, purchaseCount, expenseCount,
    invoiceCount: zRows.length + b2bCount + purchaseCount,
    salesBase18, salesBase8, salesVat0Base, salesBase, salesVat18, salesVat8, salesVatTotal, salesGross,
    purchaseInvoiceBase18, purchaseInvoiceBase8, purchaseInvoiceBase,
    purchaseBase18, purchaseBase8, purchaseBase, purchaseVat18, purchaseVat8, purchaseVatTotal, purchaseGross,
    expenseBase, expenseVat, expenseVat18, expenseVat8, expenseTotal,
    outputVat, inputVat, priorCredit, vatPayable,
    grossProfit, netProfit,
  };
}

/** Kutizat zyrtare ATK sipas specifikimit D */
function computeAtkBoxes(totals, priorCredit) {
  const t = totals;
  const box9 = priorCredit != null ? round2(priorCredit) : round2(t.priorCredit || 0);
  const box10a = t.salesBase18;
  const box10b = t.salesBase8;
  const box10c = t.salesVat0Base;
  const box11 = round2(box10a + box10b + box10c);
  const box12 = round2(box10a * 0.18);
  const box14 = round2(box10b * 0.08);
  const box16 = round2(box12 + box14);
  const box31 = t.purchaseInvoiceBase18 ?? t.purchaseBase18;
  const box43 = round2(box31 * 0.18);
  const box45 = t.purchaseInvoiceBase8 ?? t.purchaseBase8;
  const box47 = round2(box45 * 0.08);
  const box65 = round2(box43 + box47);
  const k1 = box16;
  const k2 = round2(t.inputVat);
  const box30 = round2(k1 - k2 - box9);

  return {
    "9": box9,
    "10a": box10a,
    "10b": box10b,
    "10c": box10c,
    "11": box11,
    "12": box12,
    "14": box14,
    "16": box16,
    "31": box31,
    "43": box43,
    "45": box45,
    "47": box47,
    "65": box65,
    K1: k1,
    K2: k2,
    "30": box30,
    _actual: {
      salesVat18: t.salesVat18,
      salesVat8: t.salesVat8,
      inputVat: t.inputVat,
      vatPayable: t.vatPayable,
    },
  };
}

function selfCheck(boxes, totals) {
  const b = boxes;
  const t = totals || {};
  const checks = [];
  checks.push({ id: 1, critical: true, ok: round2(b["10a"] * 0.18) === round2(b["12"]), label: "[12] = [10a] × 18%" });
  checks.push({ id: 2, critical: true, ok: round2(b["10b"] * 0.08) === round2(b["14"]), label: "[14] = [10b] × 8%" });
  checks.push({ id: 3, critical: true, ok: round2(b["12"] + b["14"]) === round2(b["16"]), label: "[16] = [12] + [14]" });
  checks.push({ id: 4, critical: true, ok: round2(b["31"] * 0.18) === round2(b["43"]), label: "[43] = [31] × 18%" });
  checks.push({ id: 5, critical: true, ok: round2(b["45"] * 0.08) === round2(b["47"]), label: "[47] = [45] × 8%" });
  checks.push({ id: 6, critical: true, ok: round2(b["43"] + b["47"]) === round2(b["65"]), label: "[65] = [43] + [47]" });
  checks.push({ id: 7, critical: true, ok: round2(b.K1 - b.K2 - b["9"]) === round2(b["30"]), label: "[30] = [K1] − [K2] − [9]" });
  checks.push({ id: 8, critical: false, ok: round2(b["10a"] + b["10b"] + b["10c"]) === round2(b["11"]), label: "[11] = [10a]+[10b]+[10c]" });
  if (t.salesVat18 != null) {
    checks.push({ id: 9, critical: false, ok: round2(b["12"]) === round2(t.salesVat18), label: "[12] përputhet me TVSH reale shitje 18%" });
    checks.push({ id: 10, critical: false, ok: round2(b.K2) === round2(t.inputVat), label: "[K2] përputhet me TVSH hyrje totale" });
  }
  const criticalFail = checks.filter((c) => c.critical && !c.ok);
  return { passed: criticalFail.length === 0, checks, hasWarnings: checks.some((c) => !c.critical && !c.ok) };
}

module.exports = {
  round2, vatFromGross, vatFromNet, splitZReport,
  periodBounds, previousPeriodBounds, getPriorVatCredit,
  computePeriodTotals, computeAtkBoxes, selfCheck,
};
