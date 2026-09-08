const express = require("express");
const {
  activateLicense,
  validateLicense,
  incrementScanCount,
  fetchLicense,
} = require("../services/license");
const { scanInvoiceImage } = require("../services/anthropic");
const { config } = require("../config");

function licenseMeta(body) {
  return {
    deviceId: body.device_id || body.deviceId || "",
    nui: body.nui || "",
    businessName: body.business_name || body.businessName || "",
  };
}

function createLicenseRouter() {
  const router = express.Router();

  router.post("/v1/license/validate", async (req, res) => {
    try {
      const { license_key } = req.body || {};
      const result = await validateLicense(license_key, licenseMeta(req.body || {}));
      if (!result.ok) {
        const status = ["license_expired", "scan_limit", "nui_mismatch", "device_mismatch"].includes(result.code) ? 403 : 401;
        return res.status(status).json(result);
      }
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[validate]", e.message);
      res.status(500).json({ ok: false, error: e.message, code: "server_error" });
    }
  });

  router.post("/v1/license/activate", async (req, res) => {
    try {
      const { license_key } = req.body || {};
      const result = await activateLicense(license_key, licenseMeta(req.body || {}));
      if (!result.ok) {
        const status = ["device_mismatch", "license_expired", "nui_mismatch"].includes(result.code) ? 403 : 401;
        return res.status(status).json(result);
      }
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[activate]", e.message);
      res.status(500).json({ ok: false, error: e.message, code: "server_error" });
    }
  });

  router.post("/v1/scan-invoice", async (req, res) => {
    try {
      const { license_key, imageBase64, mimeType } = req.body || {};
      if (!license_key) return res.status(400).json({ ok: false, error: "Mungon licenca", code: "missing_license" });
      if (!imageBase64) return res.status(400).json({ ok: false, error: "Mungon foto", code: "missing_image" });
      if (!mimeType) return res.status(400).json({ ok: false, error: "Mungon lloji i skedarit", code: "missing_mime" });

      const sizeBytes = Buffer.byteLength(imageBase64, "base64");
      const maxBytes = config.maxImageMb * 1024 * 1024;
      if (sizeBytes > maxBytes) {
        return res.status(400).json({ ok: false, error: `Skedari tejkalon ${config.maxImageMb} MB`, code: "file_too_large" });
      }

      const meta = licenseMeta(req.body || {});
      const lic = await validateLicense(license_key, meta);
      if (!lic.ok) {
        const status = ["license_expired", "scan_limit", "device_mismatch"].includes(lic.code) ? 403 : 401;
        return res.status(status).json(lic);
      }

      const fetched = await fetchLicense(license_key);
      if (!fetched.ok) return res.status(401).json(fetched);

      const data = await scanInvoiceImage(imageBase64, mimeType);
      const used = await incrementScanCount(fetched.license.id);
      const limit = Number(fetched.license.scans_limit);
      const remaining = limit > 0 ? Math.max(0, limit - used) : null;

      res.json({ ok: true, data, scans_used: used, scans_remaining: remaining });
    } catch (e) {
      const code = e.code || "unknown";
      console.error("[scan]", code, e.message);
      if (code === "bad_json") return res.status(422).json({ ok: false, error: e.message, code });
      if (code === "timeout") return res.status(502).json({ ok: false, error: "❌ Gabim lidhje — provo përsëri", code });
      if (code === "bad_format") return res.status(400).json({ ok: false, error: e.message, code });
      if (code === "no_anthropic") return res.status(503).json({ ok: false, error: e.message, code });
      res.status(500).json({ ok: false, error: e.message || "Gabim analize", code });
    }
  });

  return router;
}

module.exports = { createLicenseRouter };
