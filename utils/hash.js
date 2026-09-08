const crypto = require("crypto");

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function hashSmsCode(phone, code) {
  const pepper = process.env.SMS_CODE_PEPPER || "rev-kont-sms-pepper-v1";
  return sha256(`${pepper}:${phone}:${code}`);
}

function randomSmsCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function uuidV4() {
  return crypto.randomUUID();
}

module.exports = { sha256, hashSmsCode, randomSmsCode, uuidV4 };
