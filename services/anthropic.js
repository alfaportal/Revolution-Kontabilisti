const PURCHASE_PROMPT = `Analizo këtë faturë blerje dhe nxirr të dhënat në JSON:
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
  "confidence": {"supplier_name":"high/medium/low","supplier_nui":"high/medium/low/not_found","items":"high/medium/low"}
}
Kthe VETËM JSON. Çmimet në Euro (€). TVSH Kosovë: 18%, 8%, 0%.`;

const B2B_SALES_PROMPT = `Analizo këtë faturë SHITJE B2B dhe nxirr të dhënat në JSON:
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
  "confidence": {"buyer_name":"high/medium/low","buyer_nui":"high/medium/low/not_found","buyer_fiscal":"high/medium/low/not_found","items":"high/medium/low"}
}
Kthe VETËM JSON. Çmimet e artikujve janë PA TVSH (neto).
Kjo është faturë e lëshuar nga biznesi im te një biznes tjetër (blerësi = buyer_*).
TVSH Kosovë: 18%, 8%, 0%.`;

function parseJson(text) {
  const cleaned = String(text || "").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

async function scanInvoice(imageBase64, mimeType, scanType = "purchase") {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error("ANTHROPIC_API_KEY not set");
    err.code = "NO_ANTHROPIC";
    throw err;
  }
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(mimeType)) {
    const err = new Error("Format i papranuar");
    err.code = "BAD_FORMAT";
    throw err;
  }

  const prompt = scanType === "b2b_sales" ? B2B_SALES_PROMPT : PURCHASE_PROMPT;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Përgjigje e zbrazët nga AI");
  try {
    return parseJson(text);
  } catch {
    const err = new Error("AI nuk mundi ta lexojë");
    err.code = "BAD_JSON";
    throw err;
  }
}

module.exports = { scanInvoice };
