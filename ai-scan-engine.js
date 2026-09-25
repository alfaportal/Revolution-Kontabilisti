const { getPromptForType } = require("./ai-scan-prompts");

function parseAiJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

async function scanDocument(apiKey, imageBase64, mimeType, scanType = "purchase") {
  if (!apiKey) {
    const err = new Error("ANTHROPIC_API_KEY not set");
    err.code = "NO_ANTHROPIC";
    throw err;
  }

  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(mimeType)) {
    const err = new Error("Format i papranuar — përdorni JPG ose PNG");
    err.code = "BAD_FORMAT";
    throw err;
  }

  const { prompt } = getPromptForType(scanType);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 2500,
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
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.code = res.status === 401 ? "INVALID_KEY" : "API_ERROR";
      throw err;
    }
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("Përgjigje e zbrazët nga AI");
    try {
      return parseAiJson(text);
    } catch {
      const err = new Error("⚠️ AI nuk mundi ta lexojë — regjistro manualisht");
      err.code = "BAD_JSON";
      throw err;
    }
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("❌ Gabim lidhje — provo përsëri");
      err.code = "timeout";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { scanDocument, parseAiJson };
