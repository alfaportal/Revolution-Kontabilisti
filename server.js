require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./utils/logger");
const { globalRateLimit } = require("./middleware/rate-limit");
const licenseRoutes = require("./routes/license");
const aiScanRoutes = require("./routes/ai-scan");
const adminRoutes = require("./routes/admin");

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(",") || true }));
app.use(express.json({ limit: "12mb" }));
app.use(globalRateLimit);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "revolution-kontabilisti-server",
    mode: process.env.SUPABASE_URL ? "supabase" : "local-mock",
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.use("/api/license", licenseRoutes);
app.use("/api/ai", aiScanRoutes);
app.use("/api/admin", adminRoutes);

app.use("/admin", express.static(path.join(__dirname, "public", "admin")));
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

app.use((_req, res) => res.status(404).json({ status: "error", message: "Not found" }));

app.use((err, _req, res, _next) => {
  logger.error("unhandled", err.message);
  res.status(500).json({ status: "error", message: "Gabim serveri" });
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Serveri :${PORT} | Admin: http://localhost:${PORT}/admin`);
    if (!process.env.SUPABASE_URL) logger.info("Mode: local-mock (pa Supabase)");
  });
}

module.exports = app;
