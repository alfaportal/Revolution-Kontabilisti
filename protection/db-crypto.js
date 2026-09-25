const crypto = require("crypto");
const { getDeviceId } = require("../license-hardware");
const { DB_KEY_SECRET, DB_MAGIC } = require("./constants");

function isProtectionEnabled() {
  return process.env.KONTABILISTI_PROTECTED === "1" && process.env.DEV_MODE !== "true";
}

function generateDbKey() {
  const deviceId = getDeviceId();
  return crypto.createHmac("sha256", DB_KEY_SECRET).update(deviceId).digest().subarray(0, 32);
}

function isEncryptedBuffer(buf) {
  if (!buf || buf.length < DB_MAGIC.length + 29) return false;
  return buf.subarray(0, DB_MAGIC.length).toString("utf8") === DB_MAGIC;
}

function encryptDbBuffer(plain) {
  const key = generateDbKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(DB_MAGIC, "utf8"), iv, tag, enc]);
}

function decryptDbBuffer(buf) {
  if (!isEncryptedBuffer(buf)) return null;
  const off = DB_MAGIC.length;
  const iv = buf.subarray(off, off + 12);
  const tag = buf.subarray(off + 12, off + 28);
  const data = buf.subarray(off + 28);
  const key = generateDbKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function readDbFile(dbPath, fsMod) {
  const fs = fsMod || require("fs");
  if (!fs.existsSync(dbPath)) return null;
  const raw = fs.readFileSync(dbPath);
  if (!isProtectionEnabled()) return raw;
  if (isEncryptedBuffer(raw)) {
    return decryptDbBuffer(raw);
  }
  return raw;
}

function writeDbFile(dbPath, plainBuffer, fsMod) {
  const fs = fsMod || require("fs");
  const out = isProtectionEnabled() ? encryptDbBuffer(plainBuffer) : plainBuffer;
  fs.mkdirSync(require("path").dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, out);
}

module.exports = {
  isProtectionEnabled,
  isEncryptedBuffer,
  encryptDbBuffer,
  decryptDbBuffer,
  readDbFile,
  writeDbFile,
};
