const { config } = require("../config");

const INVOICE_SCAN_PROMPT = `Analizo këtë faturë blerje dhe nxirr të dhënat në JSON:
{
  "supplier_name": "",
  "supplier_nui": "",
  "supplier_fiscal": "",
  "invoice_number": "",
  "invoice_date": "YYYY-MM-DD",
  "items": [
    {
      "description": "",
      "quantity": 0,
      "unit": "copë",
      "unit_price": 0.00,
      "vat_rate": 0.18,
      "total": 0.00
    }
  ],
  "subtotal": 0.00,
  "vat_total": 0.00,
  "grand_total": 0.00,
  "payment_method": "",
  "confidence": {
    "supplier_name": "high/medium/low",
    "supplier_nui": "high/medium/low/not_found",
    "supplier_fiscal": "high/medium/low/not_found",
    "invoice_number": "high/medium/low",
    "invoice_date": "high/medium/low",
    "items": "high/medium/low"
  }
}
Kthe VETËM JSON, asgjë tjetër.
Çmimet janë në Euro (€).
Normat TVSH në Kosovë: 18% standard, 8% e reduktuar, 0% e përjashtuar.
Nëse nuk e gjen një fushë, lëre bosh.
Nëse nuk je i sigurt, vendos confidence = "low".`;

function parseAiJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

async function scanInvoiceImage(imageBase64, mimeType) {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(mimeType)) {
    const err = new Error("Format i papranuar — përdorni JPG ose PNG");
    err.code = "bad_format";
    throw err;
  }
  if (!config.anthropic.apiKey) {
    const err = new Error("Anthropic API nuk është konfiguruar në server");
    err.code = "no_anthropic";
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBase64 },
            },
            { type: "text", text: INVOICE_SCAN_PROMPT },
          ],
        }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.code = res.status === 401 ? "invalid_key" : "api_error";
      throw err;
    }
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("Përgjigje e zbrazët nga AI");
    try {
      return parseAiJson(text);
    } catch {
      const err = new Error("AI nuk mundi ta lexojë — regjistro manualisht");
      err.code = "bad_json";
      throw err;
    }
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("Koha e analizës skadoi");
      err.code = "timeout";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { scanInvoiceImage };
