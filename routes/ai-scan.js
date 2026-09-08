const express = require("express");
const { perDeviceRateLimit } = require("../middleware/rate-limit");
const { requireActiveLicense } = require("../middleware/license-check");
const { scanInvoice } = require("../services/anthropic");
const db = require("../services/supabase");
const logger = require("../utils/logger");

const router = express.Router();
const MAX_MB = Number(process.env.MAX_IMAGE_MB) || 10;

router.post("/scan-invoice", perDeviceRateLimit, requireActiveLicense, async (req, res) => {
  try {
    const { device_id, image_base64, mime_type, imageBase64, mimeType, scan_type } = req.body || {};
    const b64 = image_base64 || imageBase64;
    const mime = mime_type || mimeType;
    const scanType = scan_type === "b2b_sales" ? "b2b_sales" : "purchase";
    if (!b64 || !mime) {
      return res.status(400).json({ status: "error", message: "image_base64 dhe mime_type obligative" });
    }
    if (Buffer.byteLength(b64, "base64") > MAX_MB * 1024 * 1024) {
      return res.status(400).json({ status: "error", message: `Max ${MAX_MB} MB` });
    }

    const invoice_data = await scanInvoice(b64, mime, scanType);
    const inc = await db.incrementScanByDevice(device_id, {
      success: true,
      supplier_name: invoice_data.supplier_name,
      invoice_total: invoice_data.grand_total,
    });

    res.json({ status: "success", invoice_data, scans_remaining: inc.scans_remaining });
  } catch (e) {
    logger.error("scan-invoice", e.message);
    if (e.code === "NO_ANTHROPIC") {
      return res.status(503).json({ status: "error", code: "NO_ANTHROPIC", message: "ANTHROPIC_API_KEY not set" });
    }
    if (e.code === "BAD_JSON") {
      return res.status(422).json({ status: "error", code: "BAD_JSON", message: e.message });
    }
    res.status(500).json({ status: "error", message: e.message });
  }
});

module.exports = router;
