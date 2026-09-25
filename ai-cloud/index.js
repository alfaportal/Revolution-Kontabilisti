const express = require("express");
const { checkLicense, incrementScanCount } = require("./license");
const { analyzeInvoice } = require("./invoice-scan");

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "revolution-kontabilisti-ai",
    supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.post("/v1/license/validate", async (req, res) => {
  try {
    const { license_key, nui, business_name } = req.body || {};
    const result = await checkLicense(license_key, { nui, businessName: business_name });
    if (!result.ok) {
      return res.status(result.code === "license_expired" ? 403 : 401).json(result);
    }
    res.json({
      ok: true,
      message: "Licenca aktive",
      business_name: result.license.business_name,
      scans_remaining: result.scans_remaining,
      expires_at: result.license.expires_at,
    });
  } catch (e) {
    console.error("[validate]", e.message);
    res.status(500).json({ ok: false, error: e.message, code: "server_error" });
  }
});

app.post("/v1/scan-invoice", async (req, res) => {
  try {
    const { license_key, imageBase64, mimeType, nui, business_name } = req.body || {};
    if (!license_key) return res.status(400).json({ ok: false, error: "Mungon licenca" });
    if (!imageBase64) return res.status(400).json({ ok: false, error: "Mungon foto" });
    if (!mimeType) return res.status(400).json({ ok: false, error: "Mungon lloji i skedarit" });

    const sizeBytes = Buffer.byteLength(imageBase64, "base64");
    if (sizeBytes > 10 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: "Skedari tejkalon 10 MB" });
    }

    const lic = await checkLicense(license_key, { nui, businessName: business_name });
    if (!lic.ok) {
      return res.status(lic.code === "license_expired" ? 403 : 401).json(lic);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: "AI nuk është konfiguruar në server", code: "no_anthropic" });
    }

    const data = await analyzeInvoice(apiKey, imageBase64, mimeType);
    await incrementScanCount(lic.license.id);

    res.json({ ok: true, data, scans_remaining: lic.scans_remaining != null ? lic.scans_remaining - 1 : null });
  } catch (e) {
    const code = e.code || "unknown";
    console.error("[scan]", code, e.message);
    if (code === "bad_json") return res.status(422).json({ ok: false, error: "⚠️ AI nuk mundi ta lexojë — regjistro manualisht", code });
    if (code === "timeout") return res.status(502).json({ ok: false, error: "❌ Gabim lidhje — provo përsëri", code });
    if (code === "bad_format") return res.status(400).json({ ok: false, error: e.message, code });
    res.status(500).json({ ok: false, error: e.message || "Gabim analize", code });
  }
});

app.listen(PORT, () => {
  console.log(`[kontabilisti-ai] listening on :${PORT}`);
});
