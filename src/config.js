require("dotenv").config();

const config = {
  port: Number(process.env.PORT) || 8080,
  nodeEnv: process.env.NODE_ENV || "development",
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  },
  supabase: {
    url: process.env.SUPABASE_URL || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    licenseTable: process.env.SUPABASE_LICENSE_TABLE || "kontabilisti_licenses",
  },
  corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()),
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    max: Number(process.env.RATE_LIMIT_MAX) || 30,
  },
  maxImageMb: Number(process.env.MAX_IMAGE_MB) || 10,
  adminSecret: process.env.ADMIN_SECRET || "",
};

function assertRuntimeConfig() {
  const missing = [];
  if (!config.supabase.url) missing.push("SUPABASE_URL");
  if (!config.supabase.serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!config.anthropic.apiKey) missing.push("ANTHROPIC_API_KEY");
  return missing;
}

module.exports = { config, assertRuntimeConfig };
