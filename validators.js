/** Validime për fatura/shpenzime — ATK Kosovë */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isValidNui(nui) {
  const s = String(nui || "").replace(/\D/g, "");
  return s.length === 9;
}

function isFutureDate(dateStr) {
  if (!dateStr) return true;
  return dateStr > new Date().toISOString().slice(0, 10);
}

function daysOld(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / (86400000));
}

function validateSalesInvoice(body, { autoNumber }) {
  const errors = [];
  const warnings = [];
  const b = body || {};
  const items = b.items || [];

  if (!b.invoice_date) errors.push("Data e faturës obligative");
  else if (isFutureDate(b.invoice_date)) errors.push("Data nuk mund të jetë në të ardhmen");

  const invNum = autoNumber || b.invoice_number;
  if (!invNum) errors.push("Numri i faturës obligativ");

  if (!b.payment_method) errors.push("Mënyra e pagesës obligative");

  const isB2B = !!(b.client_nui && String(b.client_nui).trim());
  if (isB2B && !isValidNui(b.client_nui)) errors.push("NUI i klientit duhet 9 shifra (B2B)");
  if (isB2B && !b.client_name?.trim()) errors.push("Emri i klientit obligativ (B2B)");
  if (isB2B && !b.client_fiscal?.trim()) errors.push("Nr. Fiskal i klientit obligativ (B2B)");
  if (isB2B && !b.client_address?.trim()) errors.push("Adresa e klientit obligative (B2B)");

  if (!items.length) errors.push("Minimum 1 artikull obligativ");
  items.forEach((it, i) => {
    if (!it.description?.trim()) errors.push(`Artikulli ${i + 1}: emri obligativ`);
    if (!(Number(it.quantity) > 0)) errors.push(`Artikulli ${i + 1}: sasia duhet > 0`);
    const price = it.unit_price_with_vat != null ? it.unit_price_with_vat : it.unit_price;
    if (!(Number(price) > 0)) errors.push(`Artikulli ${i + 1}: çmimi duhet > 0`);
    if (![0, 8, 18].includes(Number(it.vat_rate))) errors.push(`Artikulli ${i + 1}: norma TVSH 18/8/0%`);
    if (round2(price) === 0) warnings.push(`Artikulli ${i + 1}: çmim 0`);
  });

  return { errors, warnings, invoice_number: invNum, client_type: isB2B ? "B2B" : "B2C" };
}

function validatePurchaseInvoice(body, { autoNumber }) {
  const errors = [];
  const warnings = [];
  const b = body || {};
  const items = b.items || [];

  if (!b.supplier_invoice_number?.trim() && !b.invoice_number?.trim()) {
    errors.push("Numri i faturës së furnitorit obligativ");
  }
  if (!b.invoice_date) errors.push("Data obligative");
  else if (isFutureDate(b.invoice_date)) errors.push("Data nuk mund të jetë në të ardhmen");
  else if (daysOld(b.invoice_date) > 30) warnings.push("Fatura > 30 ditë e vjetër — a jeni i sigurt?");

  if (!b.supplier_name?.trim()) errors.push("Emri i furnitorit obligativ");
  if (!b.supplier_nui?.trim()) errors.push("NUI i furnitorit obligativ");
  else if (!isValidNui(b.supplier_nui)) warnings.push("NUI i furnitorit nuk ka 9 shifra — TVSH mund të mos jetë e zbritshme");
  if (!b.supplier_fiscal?.trim()) errors.push("Nr. fiskal i furnitorit obligativ");

  if (!items.length) errors.push("Minimum 1 artikull obligativ");
  items.forEach((it, i) => {
    if (!it.description?.trim()) errors.push(`Artikulli ${i + 1}: emri obligativ`);
    if (!(Number(it.quantity) > 0)) errors.push(`Artikulli ${i + 1}: sasia > 0`);
    if (!(Number(it.unit_price_with_vat) > 0)) errors.push(`Artikulli ${i + 1}: çmimi > 0`);
    if (![0, 8, 18].includes(Number(it.vat_rate))) errors.push(`Artikulli ${i + 1}: norma TVSH 18/8/0%`);
  });

  const nuiOk = isValidNui(b.supplier_nui);
  return {
    errors, warnings, internal_number: autoNumber,
    supplier_invoice_number: (b.supplier_invoice_number || b.invoice_number || "").trim(),
    vat_deductible: nuiOk,
  };
}

function validateExpense(body) {
  const errors = [];
  const warnings = [];
  const b = body || {};

  if (!b.expense_date) errors.push("Data obligative");
  else if (isFutureDate(b.expense_date)) errors.push("Data nuk mund të jetë në të ardhmen");
  if (!b.category?.trim()) errors.push("Kategoria obligative");
  if (!(Number(b.amount) > 0)) errors.push("Shuma duhet > 0");

  if (b.has_vat) {
    if (![8, 18].includes(Number(b.vat_rate))) errors.push("Norma TVSH obligative (18% ose 8%)");
    if (!b.receipt_number?.trim()) errors.push("Nr. dëshmie/fature obligativ kur ka TVSH");
  }

  return { errors, warnings };
}

function validateZReport(body) {
  const errors = [];
  const b = body || {};
  const g18 = Number(b.sales_18_total) || 0;
  const g8 = Number(b.sales_8_total) || 0;
  const g0 = Number(b.sales_0_total) || 0;

  if (!b.report_date) errors.push("Data e Z-Raportit obligative");
  else if (isFutureDate(b.report_date)) errors.push("Data nuk mund të jetë në të ardhmen");
  if (!(g18 > 0 || g8 > 0 || g0 > 0)) errors.push("Minimum 1 normë TVSH me vlerë > 0");

  return { errors };
}

const KOSOVO_MUNICIPALITIES = [
  "Prishtinë", "Mitrovicë", "Pejë", "Prizren", "Ferizaj", "Gjilan", "Gjakovë",
  "Podujevë", "Vushtrri", "Suharekë", "Rahovec", "Drenas", "Lipjan", "Malishevë",
  "Kamenicë", "Viti", "Deçan", "Istog", "Klinë", "Skenderaj", "Dragash", "Fushë Kosovë",
  "Kaçanik", "Shtime", "Obiliq", "Hani i Elezit", "Mamushë", "Junik", "Kllokot",
  "Partesh", "Ranillug", "Graçanicë", "Novobërdë", "Shtërpcë", "Zubin Potok",
  "Zveçan", "Leposaviq", "Mitrovicë e Veriut",
];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidPersonalId(id) {
  return /^\d{10}$/.test(String(id || "").replace(/\D/g, ""));
}

/** Validim i të dhënave të biznesit — regjistrim / cilësimet */
function validateBusinessSettings(data) {
  const errors = [];
  const b = data || {};
  const need = (field, msg) => {
    if (!String(b[field] ?? "").trim()) errors.push(msg);
  };

  need("business_legal_name", "Emri ligjor obligativ");
  if (b.business_legal_name && String(b.business_legal_name).trim().length < 3) {
    errors.push("Emri ligjor: minimum 3 karaktere");
  }
  need("business_trade_name", "Emri tregtar obligativ");
  need("business_type", "Forma ligjore obligative");
  if (!isValidNui(b.nui)) errors.push("NUI duhet me pasë 9 shifra");
  need("fiscal_number", "Nr. Fiskal obligativ");
  need("arbk", "ARBK obligativ");
  need("registration_date", "Data e regjistrimit obligative");
  need("address", "Adresa obligative");
  need("city", "Qyteti obligativ");
  need("municipality", "Komuna obligative");
  if (b.municipality && !KOSOVO_MUNICIPALITIES.includes(b.municipality)) {
    errors.push("Komuna duhet zgjedhur nga lista");
  }
  need("phone", "Telefoni obligativ");
  if (b.phone && phoneDigits(b.phone).length < 9) errors.push("Telefoni: minimum 9 shifra");
  need("email", "Email obligativ");
  if (b.email && !isValidEmail(b.email)) errors.push("Email i pavlefshëm");
  need("owner_name", "Emri i pronarit obligativ");
  if (!isValidPersonalId(b.owner_id_number)) errors.push("Nr. personal duhet me pasë 10 shifra");
  need("owner_phone", "Telefoni i pronarit obligativ");
  if (b.owner_phone && phoneDigits(b.owner_phone).length < 9) errors.push("Telefoni i pronarit: minimum 9 shifra");
  if (!b.declaration_period) errors.push("Periudha e deklarimit obligative");
  if (!b.fiscal_year) errors.push("Viti fiskal obligativ");

  return { errors, valid: errors.length === 0 };
}

/** Validon vetëm fushat e dërguara (PUT partial) */
function validateSettingsFields(body) {
  const errors = [];
  const b = body || {};
  if (b.business_legal_name !== undefined) {
    if (!String(b.business_legal_name).trim()) errors.push("Emri ligjor obligativ");
    else if (String(b.business_legal_name).trim().length < 3) errors.push("Emri ligjor: minimum 3 karaktere");
  }
  if (b.nui !== undefined && !isValidNui(b.nui)) errors.push("NUI duhet me pasë 9 shifra");
  if (b.owner_id_number !== undefined && b.owner_id_number !== "" && !isValidPersonalId(b.owner_id_number)) {
    errors.push("Nr. personal duhet me pasë 10 shifra");
  }
  if (b.email !== undefined && b.email !== "" && !isValidEmail(b.email)) errors.push("Email i pavlefshëm");
  if (b.phone !== undefined && b.phone !== "" && phoneDigits(b.phone).length < 9) errors.push("Telefoni: minimum 9 shifra");
  if (b.owner_phone !== undefined && b.owner_phone !== "" && phoneDigits(b.owner_phone).length < 9) {
    errors.push("Telefoni i pronarit: minimum 9 shifra");
  }
  if (b.municipality !== undefined && b.municipality && !KOSOVO_MUNICIPALITIES.includes(b.municipality)) {
    errors.push("Komuna duhet zgjedhur nga lista");
  }
  return errors;
}

module.exports = {
  round2, isValidNui, isFutureDate, daysOld,
  validateSalesInvoice, validatePurchaseInvoice, validateExpense, validateZReport,
  KOSOVO_MUNICIPALITIES, validateBusinessSettings, validateSettingsFields,
  isValidEmail, isValidPersonalId, phoneDigits,
};
