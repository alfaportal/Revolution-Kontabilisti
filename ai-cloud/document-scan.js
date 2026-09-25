const { getPromptForType, normalizeScanType } = require("../ai-scan-prompts");
const { scanDocument } = require("../ai-scan-engine");

/** Referencë deploy për Railway — kopjo logjikën në revolution-kontabilisti-server */

const express = require("express");
const { analyzeInvoice } = require("./invoice-scan");

function parseJson(text) {
  const cleaned = String(text || "").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

async function scanByType(apiKey, imageBase64, mimeType, scanType) {
  const meta = getPromptForType(scanType);
  if (meta.legacyInvoice) {
    return analyzeInvoice(apiKey, imageBase64, mimeType);
  }
  return scanDocument(apiKey, imageBase64, mimeType, normalizeScanType(scanType));
}

function createScanRouter({ checkLicense, incrementScanCount }) {
  const router = express.Router();

  router.post("/scan", async (req, res) => {
    try {
      const { device_id, license_key, image_base64, imageBase64, mime_type, mimeType, scan_type } = req.body || {};
      const b64 = image_base64 || imageBase64;
      const mime = mime_type || mimeType;
      const scanType = scan_type || "purchase";

      if (!b64 || !mime) {
        return res.status(400).json({ status: "error", message: "image_base64 dhe mime_type obligative" });
      }
      if (Buffer.byteLength(b64, "base64") > 10 * 1024 * 1024) {
        return res.status(400).json({ status: "error", message: "Max 10 MB" });
      }

      const lic = await checkLicense({ device_id, license_key });
      if (!lic.ok) {
        return res.status(403).json({ status: "error", code: lic.code || "LICENSE_INVALID", message: lic.message });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ status: "error", code: "NO_ANTHROPIC", message: "AI nuk është konfiguruar" });
      }

      const scan_data = await scanByType(apiKey, b64, mime, scanType);
      const scans_remaining = await incrementScanCount(lic);

      res.json({ status: "success", scan_data, scans_remaining });
    } catch (e) {
      const code = e.code || "unknown";
      if (code === "BAD_JSON") {
        return res.status(422).json({ status: "error", code: "BAD_JSON", message: e.message });
      }
      if (code === "BAD_FORMAT") {
        return res.status(400).json({ status: "error", code: "BAD_FORMAT", message: e.message });
      }
      res.status(500).json({ status: "error", message: e.message || "Gabim skanimi" });
    }
  });

  return router;
}

module.exports = { createScanRouter, scanByType, parseJson };
