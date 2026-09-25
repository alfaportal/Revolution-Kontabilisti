/** Prompt-e shqip për skanimin AI — secili tip dokumenti */

const PURCHASE_PROMPT = `Analizo këtë faturë BLERJE dhe nxirr të dhënat në JSON:
{
  "supplier_name": "",
  "supplier_nui": "",
  "supplier_fiscal": "",
  "invoice_number": "",
  "invoice_date": "YYYY-MM-DD",
  "items": [{"description":"","quantity":0,"unit":"copë","unit_price":0.00,"vat_rate":0.18,"total":0.00}],
  "subtotal": 0.00,
  "vat_total": 0.00,
  "grand_total": 0.00,
  "payment_method": "",
  "confidence": {"supplier_name":"high/medium/low","supplier_nui":"high/medium/low/not_found","supplier_fiscal":"high/medium/low/not_found","invoice_number":"high/medium/low","invoice_date":"high/medium/low","items":"high/medium/low"}
}
Kthe VETËM JSON, asgjë tjetër. Çmimet në Euro (€). TVSH Kosovë: 18%, 8%, 0%.
Nëse nuk e gjen një fushë, lëre bosh ose null.`;

const B2B_SALES_PROMPT = `Analizo këtë faturë SHITJE B2B (e lëshuar nga biznesi im te një biznes tjetër) dhe nxirr të dhënat në JSON:
{
  "buyer_name": "",
  "buyer_nui": "",
  "buyer_fiscal": "",
  "invoice_number": "",
  "invoice_date": "YYYY-MM-DD",
  "items": [{"description":"","quantity":0,"unit":"copë","unit_price":0.00,"vat_rate":0.18,"total":0.00}],
  "subtotal": 0.00,
  "vat_total": 0.00,
  "grand_total": 0.00,
  "payment_method": "",
  "confidence": {"buyer_name":"high/medium/low","buyer_nui":"high/medium/low/not_found","buyer_fiscal":"high/medium/low/not_found","invoice_number":"high/medium/low","invoice_date":"high/medium/low","items":"high/medium/low"}
}
Kthe VETËM JSON. Çmimet e artikujve janë PA TVSH (neto). TVSH Kosovë: 18%, 8%, 0%.`;

const Z_REPORT_PROMPT = `Kjo është foto e Z-Raportit ditor nga kasa fiskale. Lexo dhe kthe VETËM JSON:
{
  "date": "YYYY-MM-DD",
  "report_number": "numri i Z-Raportit",
  "sales_18": numri (totali shitjeve me TVSH 18%),
  "sales_8": numri (totali shitjeve me TVSH 8%),
  "sales_0": numri (totali shitjeve pa TVSH),
  "fiscal_device": "numri ose emri i pajisjes fiskale"
}
Nëse data është DD.MM.YYYY, konvertoje në YYYY-MM-DD.
Nëse ndonjë fushë nuk shihet qartë, vendos null.
Shumat janë në Euro (€) dhe përfshijnë TVSH-në për normat 18% dhe 8%.`;

const EXPENSE_PROMPT = `Kjo është foto e faturës/kuponit të shpenzimit (rrymë, karburant, qira, telefon, etj.). Lexo dhe kthe VETËM JSON:
{
  "category": "Qira|Rryma|Ujë|Telefon|Internet|Paga|Karburant|Mirëmbajtje|Sigurime|Material zyre|Tjera",
  "description": "përshkrim i shkurtër",
  "amount": numri (shuma me TVSH në €),
  "vat_rate": 18 ose 8 ose 0,
  "expense_date": "YYYY-MM-DD",
  "supplier_name": "",
  "supplier_nui": "",
  "supplier_fiscal": "",
  "invoice_number": "numri i faturës ose dëshmisë"
}
Zgjidh kategorinë më të përshtatshme nga lista. Nëse data është DD.MM.YYYY, konvertoje në YYYY-MM-DD.
Nëse ndonjë fushë nuk shihet qartë, vendos null.`;

const CLIENT_PROMPT = `Kjo është foto e certifikatës ARBK ose kartvizitës së klientit B2B. Lexo dhe kthe VETËM JSON:
{
  "name": "emri i biznesit/klientit",
  "nui": "NUI (9 shifra)",
  "address": "",
  "phone": "",
  "email": "",
  "fiscal_number": "numri fiskal nëse shihet"
}
NUI duhet të jetë vetëm shifra (9). Nëse ndonjë fushë nuk shihet qartë, vendos null.`;

const BUSINESS_CERT_PROMPT = `Kjo është foto e certifikatës ARBK të regjistrimit të biznesit. Lexo dhe kthe VETËM JSON:
{
  "business_legal_name": "emri ligjor",
  "business_trade_name": "emri tregtar nëse ndryshon",
  "business_type": "SH.P.K.|B.I.|O.SH.|etj.",
  "nui": "NUI 9 shifra",
  "fiscal_number": "",
  "arbk": "numri ARBK",
  "vat_number": "",
  "registration_date": "YYYY-MM-DD",
  "address": "",
  "city": "",
  "municipality": "",
  "phone": "",
  "email": ""
}
Nëse data është DD.MM.YYYY, konvertoje në YYYY-MM-DD. Nëse ndonjë fushë nuk shihet qartë, vendos null.`;

const SCAN_TYPES = {
  purchase: { prompt: PURCHASE_PROMPT, legacyInvoice: true },
  b2b_sales: { prompt: B2B_SALES_PROMPT, legacyInvoice: true },
  "b2b-invoice": { prompt: B2B_SALES_PROMPT, legacyInvoice: true },
  "z-report": { prompt: Z_REPORT_PROMPT },
  z_report: { prompt: Z_REPORT_PROMPT },
  expense: { prompt: EXPENSE_PROMPT },
  client: { prompt: CLIENT_PROMPT },
  "business-cert": { prompt: BUSINESS_CERT_PROMPT },
  business_cert: { prompt: BUSINESS_CERT_PROMPT },
};

function normalizeScanType(raw) {
  const t = String(raw || "purchase").trim().toLowerCase().replace(/_/g, "-");
  if (t === "b2b-invoice" || t === "b2b-sales" || t === "b2b") return "b2b_sales";
  if (t === "z-report") return "z_report";
  if (t === "business-cert") return "business_cert";
  if (t === "purchase-invoice") return "purchase";
  return t.replace(/-/g, "_");
}

function getPromptForType(scanType) {
  const key = normalizeScanType(scanType);
  const entry = SCAN_TYPES[key] || SCAN_TYPES[scanType];
  if (!entry) {
    const err = new Error(`Lloj skanimi i panjohur: ${scanType}`);
    err.code = "BAD_SCAN_TYPE";
    throw err;
  }
  return { type: key, ...entry };
}

module.exports = {
  SCAN_TYPES,
  normalizeScanType,
  getPromptForType,
  PURCHASE_PROMPT,
  B2B_SALES_PROMPT,
  Z_REPORT_PROMPT,
  EXPENSE_PROMPT,
  CLIENT_PROMPT,
  BUSINESS_CERT_PROMPT,
};
