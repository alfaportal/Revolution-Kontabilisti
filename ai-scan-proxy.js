const { normalizeScanType } = require("./ai-scan-prompts");
const { scanDocument } = require("./ai-scan-engine");
const { getAnthropicApiKey, hasAnthropicApiKey } = require("./ai-config");
const { saveScanArtifact } = require("./ai-scan-storage");

async function scanDocumentLocal(imageBase64, mimeType, scanType = "purchase") {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    const err = new Error("Vendosni API Key te Cilësimet → AI");
    err.code = "NO_API_KEY";
    throw err;
  }

  const type = normalizeScanType(scanType);
  const data = await scanDocument(apiKey, imageBase64, mimeType, type);
  const saved = saveScanArtifact(type, imageBase64, mimeType, data);
  return { data, saved };
}

async function testAnthropicApiKey(apiKeyOverride) {
  const apiKey = apiKeyOverride?.trim() || getAnthropicApiKey();
  if (!apiKey) {
    const err = new Error("Nuk ka API key — vendoseni te Cilësimet → AI");
    err.code = "NO_API_KEY";
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
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
        max_tokens: 16,
        messages: [{ role: "user", content: "Përgjigju vetëm me fjalën OK." }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || `HTTP ${res.status}`);
      err.code = res.status === 401 ? "INVALID_KEY" : "API_ERROR";
      throw err;
    }
    return { ok: true, message: "API Key funksionon ✅" };
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

module.exports = {
  scanDocumentLocal,
  testAnthropicApiKey,
  hasAnthropicApiKey,
  normalizeScanType,
};
