const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { config } = require("./config");
const { createHealthRouter, createAdminRouter } = require("./routes/health");
const { createLicenseRouter } = require("./routes/license");

function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
  }));
  app.use(express.json({ limit: `${config.maxImageMb + 2}mb` }));

  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Shumë kërkesa — provo përsëri", code: "rate_limit" },
  }));

  app.use(createHealthRouter());
  app.use(createAdminRouter());
  app.use(createLicenseRouter());

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
  });

  app.use((err, _req, res, _next) => {
    console.error("[error]", err.message);
    res.status(500).json({ ok: false, error: "Gabim serveri", code: "server_error" });
  });

  return app;
}

function start() {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[kontabilisti-server] :${config.port} (${config.nodeEnv})`);
    const missing = require("./config").assertRuntimeConfig();
    if (missing.length) {
      console.warn("[kontabilisti-server] Config incomplete:", missing.join(", "));
    }
  });
}

if (require.main === module) start();

module.exports = { createApp, start };
