const logger = require("../utils/logger");

async function sendSms(phone, message) {
  const provider = process.env.SMS_PROVIDER || "mock";
  if (provider === "mock" || !process.env.SMS_API_KEY) {
    logger.info(`[SMS MOCK] → ${phone}: ${message}`);
    return { ok: true, mock: true };
  }
  // Vonage / Twilio — shto integrim kur të konfigurohet
  logger.warn("SMS provider i konfiguruar por jo implementuar — përdor mock");
  logger.info(`[SMS] → ${phone}: ${message}`);
  return { ok: true, mock: true };
}

function maskPhone(phone) {
  const p = String(phone || "").replace(/\s/g, "");
  if (p.length < 6) return p;
  return p.slice(0, 5) + "*".repeat(Math.max(0, p.length - 7)) + p.slice(-2);
}

module.exports = { sendSms, maskPhone };
