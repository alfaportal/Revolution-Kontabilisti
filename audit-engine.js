/** Self-audit para gjenerimit të Deklaratës TVSH */
const { round2, computePeriodTotals, computeAtkBoxes, selfCheck } = require("./vat-engine");

/** 10 kontrolle zyrtare për modulin Dërgo në ATK */
function buildFullSelfCheck(db, start, end, periodType) {
  const totals = computePeriodTotals(db, start, end, periodType);
  const boxes = computeAtkBoxes(totals);
  const b = boxes;

  const emptySales = db.prepare(
    `SELECT si.id FROM sales_invoices si
     LEFT JOIN sales_invoice_items it ON it.invoice_id = si.id
     WHERE si.status='finalized' AND si.invoice_date BETWEEN ? AND ?
     GROUP BY si.id HAVING COUNT(it.id)=0`
  ).all(start, end);

  const emptyPurch = db.prepare(
    `SELECT pi.id FROM purchase_invoices pi
     LEFT JOIN purchase_invoice_items it ON it.invoice_id = pi.id
     WHERE pi.status='finalized' AND pi.invoice_date BETWEEN ? AND ?
     GROUP BY pi.id HAVING COUNT(it.id)=0`
  ).all(start, end);

  const checks = [
    { id: 1, critical: true, ok: emptySales.length === 0 && emptyPurch.length === 0, label: "Krejt faturat e periudhës kanë artikuj" },
    { id: 2, critical: true, ok: round2(b["10a"] + b["10b"] + b["10c"]) === round2(b["11"]), label: "[11] = [10a] + [10b] + [10c]" },
    { id: 3, critical: true, ok: round2(b["10a"] * 0.18) === round2(b["12"]), label: "[12] = [10a] × 0.18" },
    { id: 4, critical: true, ok: round2(b["10b"] * 0.08) === round2(b["14"]), label: "[14] = [10b] × 0.08" },
    { id: 5, critical: true, ok: round2(b["12"] + b["14"]) === round2(b["16"]), label: "[16] = [12] + [14]" },
    { id: 6, critical: true, ok: round2(b["43"] + b["47"]) === round2(b["65"]), label: "[65] = [43] + [47]" },
    { id: 7, critical: true, ok: round2(b["31"] * 0.18) === round2(b["43"]), label: "[43] = [31] × 0.18" },
    { id: 8, critical: true, ok: round2(b["45"] * 0.08) === round2(b["47"]), label: "[47] = [45] × 0.08" },
    { id: 9, critical: true, ok: round2(b.K1 - b.K2 - b["9"]) === round2(b["30"]), label: "[30] = [K1] − [K2] − [9]" },
    { id: 10, critical: true, ok: round2(b["9"]) === round2(totals.priorCredit || 0), label: "[9] = krediti i bartur" },
  ];

  const passed = checks.every((c) => c.ok);
  return { passed, checks, boxes, totals };
}

function runVatAudit(db, start, end, periodType) {
  const full = buildFullSelfCheck(db, start, end, periodType);
  const { totals, boxes } = full;
  const baseCheck = selfCheck(boxes, totals);
  const errors = [];
  const warnings = [];

  full.checks.filter((c) => !c.ok).forEach((c) => errors.push(c.label));

  const zeroItems = db.prepare(
    `SELECT COUNT(*) as c FROM sales_invoice_items si
     JOIN sales_invoices inv ON inv.id=si.invoice_id
     WHERE inv.status='finalized' AND inv.invoice_date BETWEEN ? AND ?
     AND (si.unit_price=0 OR si.quantity=0)`
  ).get(start, end);
  if (zeroItems.c > 0) warnings.push(zeroItems.c + " rreshta shitje me çmim/sasi zero");

  const dupZ = db.prepare(
    `SELECT COUNT(*) as c FROM z_reports
     WHERE status='active' AND report_date BETWEEN ? AND ?
     GROUP BY report_date HAVING COUNT(*)>1`
  ).all(start, end);
  if (dupZ.length > 0) warnings.push(dupZ.length + " ditë me Z-Raport të dyfishtë");

  const oldPending = db.prepare(
    `SELECT COUNT(*) as c FROM declaration_deadlines
     WHERE status IN ('pending','overdue') AND period_end < ?`
  ).get(start);
  if (oldPending.c > 0) warnings.push(oldPending.c + " periudha të mëparshme pa deklaratë");

  if (totals.priorCredit > 0) {
    warnings.push(`Kredit TVSH [9] bartur: ${totals.priorCredit.toFixed(2)} €`);
  }

  const salesBase = totals.salesBase;
  if (round2(boxes["11"]) !== round2(salesBase)) {
    warnings.push(`Libri shitjeve neto (${salesBase}) ≠ [11] (${boxes["11"]})`);
  }

  baseCheck.checks
    .filter((c) => !c.ok && !full.checks.some((x) => x.label === c.label))
    .forEach((c) => {
      if (c.critical) errors.push(c.label);
      else warnings.push(c.label);
    });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totals,
    boxes,
    selfCheck: full,
  };
}

module.exports = { runVatAudit, buildFullSelfCheck };
