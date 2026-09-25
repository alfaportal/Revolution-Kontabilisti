const fs = require("fs");
const path = require("path");
const { getSettings, updateSettings } = require("./database");
const { encryptApiKey, decryptApiKey, maskApiKey } = require("./api-key-crypto");
const { DATA_DIR } = require("./data-paths");

const AI_CONFIG_PATH = path.join(DATA_DIR, "ai-config.json");

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** Prioritet: env → settings DB → ai-config.json */
function getAnthropicApiKey() {
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  if (env) return env;

  const s = getSettings();
  const fromDb = decryptApiKey(s?.anthropic_api_key_enc);
  if (fromDb) return fromDb;

  const file = readJsonFile(AI_CONFIG_PATH);
  if (file?.anthropic_api_key_enc) {
    return decryptApiKey(file.anthropic_api_key_enc);
  }
  return null;
}

function hasAnthropicApiKey() {
  return !!getAnthropicApiKey();
}

function saveAnthropicApiKey(plainText) {
  const trimmed = String(plainText || "").trim();
  if (!trimmed) {
    updateSettings({ anthropic_api_key_enc: null });
    try {
      if (fs.existsSync(AI_CONFIG_PATH)) fs.unlinkSync(AI_CONFIG_PATH);
    } catch { /* ignore */ }
    return { saved: false, cleared: true };
  }

  const enc = encryptApiKey(trimmed);
  updateSettings({ anthropic_api_key_enc: enc });
  writeJsonFile(AI_CONFIG_PATH, {
    anthropic_api_key_enc: enc,
    updated_at: new Date().toISOString(),
  });
  return { saved: true, masked: maskApiKey(trimmed) };
}

function getAiConfigPublic() {
  const key = getAnthropicApiKey();
  return {
    has_key: !!key,
    key_masked: key ? maskApiKey(key) : "",
    source: process.env.ANTHROPIC_API_KEY?.trim() ? "env" : (key ? "settings" : "none"),
  };
}

module.exports = {
  getAnthropicApiKey,
  hasAnthropicApiKey,
  saveAnthropicApiKey,
  getAiConfigPublic,
  AI_CONFIG_PATH,
};
