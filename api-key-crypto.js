const crypto = require("crypto");
const os = require("os");

const APP_SALT = "revolution-kontabilisti-ai-v1";

function deriveKey() {
  const seed = [
    os.hostname(),
    os.userInfo().username,
    os.platform(),
    APP_SALT,
  ].join("|");
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptApiKey(plainText) {
  if (!plainText || !String(plainText).trim()) return null;
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plainText).trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptApiKey(encrypted) {
  if (!encrypted) return null;
  try {
    const buf = Buffer.from(encrypted, "base64");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function maskApiKey(key) {
  if (!key || key.length < 8) return "";
  return key.slice(0, 7) + "…" + key.slice(-4);
}

module.exports = { encryptApiKey, decryptApiKey, maskApiKey };
