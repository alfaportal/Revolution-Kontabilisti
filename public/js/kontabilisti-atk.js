/** Kutizat ATK — i njëjti model si Security (pa të dhëna nga Security). */
const KONT_ATK = (() => {
  const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const splitGross = (gross, ratePct = 18) => {
    const g = money(gross);
    const r = Number(ratePct) || 0;
    if (r <= 0) return { gross: g, net: g, vat: 0 };
    const net = money(g / (1 + r / 100));
    return { gross: g, net, vat: money(g - net) };
  };

  function salesBoxesFromTotals(t, b) {
    return {
      box9: b["9"] || 0,
      box10a: b["10a"] || 0,
      box10b: b["10b"] || 0,
      box10c: b["10c"] || 0,
      box10: money((b["10a"] || 0) + (b["10b"] || 0) + (b["10c"] || 0)),
      box11: 0,
      box12: t.salesBase18 || 0,
      box14: t.salesBase8 || 0,
      box16: 0, box18: 0, box20: 0, box22: 0, box24: 0, box26: 0, box28: 0,
      boxK1: t.salesVat18 || 0,
      boxK2: t.salesVat8 || 0,
      box30: t.outputVat || 0,
    };
  }

  function purchaseBoxesFromTotals(t) {
    return {
      box31: 0, box32: 0, box33: 0, box34: 0, box35: 0, box37: 0,
      box39: 0, box41: 0,
      box43: t.purchaseBase || 0,
      box45: 0,
      box47: 0, box49: 0, box51: 0, box53: 0, box55: 0, box57: 0, box59: 0,
      box61: 0, box63: 0, box65: 0,
      boxK1: money((t.purchaseVat18 || 0) + (t.expenseVat18 || 0)),
      boxK2: money((t.purchaseVat8 || 0) + (t.expenseVat8 || 0)),
      box67: t.inputVat || 0,
    };
  }

  function buildVatDeclarationFromBoxes(boxes, totals) {
    const b = boxes || {};
    const t = totals || {};
    const decl = {
      "[9] Kredit TVSH nga periudha e mëparshme": b["9"] || 0,
      "[10a] Shitje me normë 18% — Baza": b["10a"] || 0,
      "[10b] Shitje me normë 8% — Baza": b["10b"] || 0,
      "[10c] Shitje me normë 0% — Baza": b["10c"] || 0,
      "[11] Totali i bazës së shitjeve": b["11"] || 0,
      "[12] TVSH 18%": b["12"] || 0,
      "[14] TVSH 8%": b["14"] || 0,
      "[16] TVSH totale e daljes": b["16"] || 0,
      "[31] Blerje me normë 18% — Baza": b["31"] || 0,
      "[43] TVSH e zbritshme 18%": b["43"] || 0,
      "[45] Blerje me normë 8% — Baza": b["45"] || 0,
      "[47] TVSH e zbritshme 8%": b["47"] || 0,
      "[65] TVSH totale e hyrjes": b["65"] || 0,
      "[K1] TVSH e daljes": b.K1 || 0,
      "[K2] TVSH e hyrjes": b.K2 || 0,
      "[30] TVSH për pagesë/kthim": b["30"] || 0,
    };
    return {
      boxes: decl,
      vat_payable: b["30"] || 0,
      vat_deductible: b["65"] || 0,
      prior_credit: b["9"] || 0,
      totals: t,
    };
  }

  function buildVatDeclaration(salesBoxes, purchaseBoxes) {
    const s = salesBoxes || {};
    const p = purchaseBoxes || {};
    const boxes = {
      "[9] Shitjet e liruara pa të drejtë kreditimi": s.box9 || 0,
      "[10a] Shitjet e shërbimeve jashtë vendit": s.box10a || 0,
      "[10b] Shitjet me ngarkesë të kundërt": s.box10b || 0,
      "[10c] Shitjet tjera të liruara me kreditim": s.box10c || 0,
      "[10] Totali i shitjeve të liruara me kreditim": s.box10 || 0,
      "[11] Eksportet": s.box11 || 0,
      "[12] Shitjet e tatueshme 18%": s.box12 || 0,
      "[14] Shitjet e tatueshme 8%": s.box14 || 0,
      "[16] Nota debitore / kreditore 18%": s.box16 || 0,
      "[18] Nota debitore / kreditore 8%": s.box18 || 0,
      "[20] Fatura e borxhit të keq 18%": s.box20 || 0,
      "[22] Fatura e borxhit të keq 8%": s.box22 || 0,
      "[24] Rregullimet për të rritur TVSH 18%": s.box24 || 0,
      "[26] Rregullimet / ngarkesa e kundërt 8%": s.box26 || 0,
      "[28] Blerjet me ngarkesë të kundërt": s.box28 || 0,
      "[K1] TVSH e llogaritur 18%": s.boxK1 || 0,
      "[K2] TVSH e llogaritur 8%": s.boxK2 || 0,
      "[30] Total TVSH e llogaritur": s.box30 || 0,
      "[31] Blerjet/importet pa TVSH": p.box31 || 0,
      "[32] Blerjet/importet investive pa TVSH": p.box32 || 0,
      "[33] Blerjet me TVSH jo të zbritshme": p.box33 || 0,
      "[34] Blerjet investive me TVSH jo të zbritshme": p.box34 || 0,
      "[35] Importet 18%": p.box35 || 0,
      "[37] Importet 8%": p.box37 || 0,
      "[39] Importet investive 18%": p.box39 || 0,
      "[41] Importet investive 8%": p.box41 || 0,
      "[43] Blerjet vendore 18%": p.box43 || 0,
      "[45] Blerjet vendore 8%": p.box45 || 0,
      "[47] Blerjet investive vendore 18%": p.box47 || 0,
      "[49] Blerjet investive vendore 8%": p.box49 || 0,
      "[51] Blerjet nga fermerët 8%": p.box51 || 0,
      "[53] Nota debitore/kreditore blerje 18%": p.box53 || 0,
      "[55] Nota debitore/kreditore blerje 8%": p.box55 || 0,
      "[57] Fatura e borxhit të keq e lëshuar 18%": p.box57 || 0,
      "[59] Fatura e borxhit të keq e lëshuar 8%": p.box59 || 0,
      "[61] Rregullimet për të ulur TVSH 18%": p.box61 || 0,
      "[63] Rregullimet / ngarkesa e kundërt 8%": p.box63 || 0,
      "[65] E drejta e kreditimit (ngarkesa e kundërt)": p.box65 || 0,
      "[K1] TVSH e zbritshme 18%": p.boxK1 || 0,
      "[K2] TVSH e zbritshme 8%": p.boxK2 || 0,
      "[67] Total TVSH e zbritshme": p.box67 || 0,
    };
    const vatOut = money(s.box30 || 0);
    const vatIn = money(p.box67 || 0);
    const vatPayable = money(vatOut - vatIn);
    return { boxes, vat_payable: vatPayable, vat_deductible: vatIn };
  }

  function approxWageTax(gross) {
    const g = Number(gross) || 0;
    if (g <= 80) return 0;
    if (g <= 250) return money((g - 80) * 0.04);
    if (g <= 450) return money(6.8 + (g - 250) * 0.08);
    return money(22.8 + (g - 450) * 0.1);
  }

  function buildWithholdingTaxFromPayroll(payrollRows) {
    const list = payrollRows || [];
    const gross = money(list.reduce((s, r) => s + (Number(r.gross) || 0), 0));
    const empPen = money(list.reduce((s, r) => s + (Number(r.employeePension) || 0), 0));
    const erPen = money(list.reduce((s, r) => s + (Number(r.employerPension) || 0), 0));
    let wageTax = 0;
    const bands = { up_to_250: 0, from_250_450: 0, over_450: 0 };
    for (const r of list) {
      const g = Number(r.gross) || 0;
      if (g <= 250) bands.up_to_250 += 1;
      else if (g <= 450) bands.from_250_450 += 1;
      else bands.over_450 += 1;
      wageTax += approxWageTax(g);
    }
    return {
      "[8] Pagat bruto": gross,
      "[9] Tatimi i mbajtur": money(wageTax),
      "[10] Nr. punëtorëve": list.length,
      "[11] Deri 250€": bands.up_to_250,
      "[12] 250–450€": bands.from_250_450,
      "[13] Mbi 450€": bands.over_450,
      "[18] Kontributet e punëtorit": empPen,
      "[19] Kontributet e punëdhënësit": erPen,
      "[20] Kontributet totale": money(empPen + erPen),
    };
  }

  function buildRentFormBoxes(rentRows) {
    const list = rentRows || [];
    const sum = (k) => money(list.reduce((s, r) => s + (Number(r[k]) || 0), 0));
    const rent = sum("rentGross");
    const tmbRent = money(rent * 0.09);
    const interest = sum("interest");
    const tmbOther = money(interest * 0.1);
    return {
      "[8] Interesi": interest,
      "[9] Të drejtat pronësore": 0,
      "[13] Qiraja bruto": rent,
      "[14] TMB mbi qira 9%": tmbRent,
      "[12] TMB tjetër 10%": tmbOther,
      "[18] TMB total": money(tmbRent + tmbOther),
    };
  }

  function buildQuarterlyInstallment({ income, expenses, priorYearTax = 0 }) {
    const rev = money(income);
    const exp = money(expenses);
    const profit = money(Math.max(0, rev - exp));
    const box11 = money(profit * 0.1);
    const box12 = money(((Number(priorYearTax) || 0) * 1.1) / 4);
    const box13 = money(Math.max(box11, box12));
    return {
      "[8] Të ardhurat (periudha)": rev,
      "[9] Shpenzimet": exp,
      "[10] Fitimi": profit,
      "[11] Kësti 10%": box11,
      "[12] 110% viti kaluar / 4": box12,
      "[13] Pagesa e këstit": box13,
      "[15] Pagesa totale": box13,
    };
  }

  function buildAnnualCdBoxes({ sales, purchases, expenses, wages }) {
    const revenue = money(sales);
    const purch = money(purchases);
    const admin = money(expenses);
    const wage = money(wages);
    const profit = money(revenue - purch - admin - wage);
    const tax = money(Math.max(0, profit) * 0.1);
    return {
      "CD — Të ardhurat": revenue,
      "CD — Blerjet / COGS": purch,
      "CD — Shpenzime": admin,
      "CD — Pagat": wage,
      "CD — Fitimi para tatimit": profit,
      "CD — Tatimi 10%": tax,
      "CD — Fitimi neto": money(profit - tax),
    };
  }

  function payrollFromExpenses(expRows) {
    return (expRows || []).map((r, i) => {
      const gross = money(r.amount);
      return {
        id: r.id || i,
        firstName: (r.description || r.category || "Punëtor").split(" ")[0],
        lastName: (r.description || "").split(" ").slice(1).join(" ") || "—",
        individualNumber: r.id || i + 1,
        hours: 0,
        gross,
        employeePension: money(gross * 0.05),
        employerPension: money(gross * 0.05),
        tax: approxWageTax(gross),
      };
    });
  }

  function payrollFromSalesGross(gross, settings) {
    const g = money(gross);
    if (g <= 0) return [];
    const rate = Number(settings?.default_hourly_rate) || 4;
    const hours = rate > 0 ? money(g / rate) : 0;
    const owner = String(settings?.owner_name || settings?.business_legal_name || "Punëtor").trim();
    const parts = owner.split(/\s+/);
    return [{
      id: "sales-payroll",
      firstName: parts[0] || "Punëtor",
      lastName: parts.slice(1).join(" ") || "—",
      individualNumber: settings?.owner_id_number || "—",
      hours,
      gross: g,
      employeePension: money(g * 0.05),
      employerPension: money(g * 0.05),
      tax: approxWageTax(g),
    }];
  }

  function avgHourRateFromSales(gross, settings) {
    const g = money(gross);
    const rate = Number(settings?.default_hourly_rate) || 0;
    if (rate > 0) return rate;
    return g > 0 ? 4 : 0;
  }

  return {
    money, splitGross,
    salesBoxesFromTotals, purchaseBoxesFromTotals,
    buildVatDeclaration, buildVatDeclarationFromBoxes, buildWithholdingTaxFromPayroll,
    buildRentFormBoxes, buildQuarterlyInstallment, buildAnnualCdBoxes,
    payrollFromExpenses, payrollFromSalesGross, avgHourRateFromSales, approxWageTax,
  };
})();
