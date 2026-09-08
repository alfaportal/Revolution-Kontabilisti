const rateLimit = require("express-rate-limit");

const globalRateLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const perDeviceRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => req.body?.device_id || req.ip,
  message: { status: "error", code: "RATE_LIMIT", message: "Shumë kërkesa — provo përsëri" },
});

module.exports = { globalRateLimit, perDeviceRateLimit };
