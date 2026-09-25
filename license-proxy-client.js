const { getLicenseServerUrl } = require("./license-server-config");
const { getDeviceId } = require("./license-hardware");

function apiBase() {
  return `${getLicenseServerUrl().replace(/\/+$/, "")}/api`;
}

async function serverFetch(path, body, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && data.valid !== false && data.status !== "success" && data.valid !== true) {
      const err = new Error(data.message || data.error || `HTTP ${res.status}`);
      err.code = data.code || "server_error";
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("❌ Gabim lidhje — provo përsëri");
      err.code = "timeout";
      throw err;
    }
    if (String(e.message || "").includes("fetch failed")) {
      const err = new Error("Skanimi AI kërkon internet dhe licencë aktive");
      err.code = "network";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function checkLicense(deviceId = getDeviceId()) {
  return serverFetch("/license/check", { device_id: deviceId }, 20000);
}

async function activateLicenseRemote({ license_key, device_id, email } = {}) {
  return serverFetch(
    "/license/activate",
    {
      device_id: device_id || getDeviceId(),
      license_key: String(license_key || "").trim(),
      email: String(email || "").trim().toLowerCase(),
    },
    20000,
  );
}

async function scanInvoiceViaServer(imageBase64, mimeType, deviceId = getDeviceId(), scanType = "purchase") {
  const data = await serverFetch("/ai/scan-invoice", {
    device_id: deviceId,
    image_base64: imageBase64,
    mime_type: mimeType,
    scan_type: scanType,
  });
  if (data.status === "error") {
    const err = new Error(data.message || "Gabim skanimi");
    err.code = data.code;
    throw err;
  }
  return data;
}

async function scanViaServerUnified(imageBase64, mimeType, scanType, deviceId = getDeviceId()) {
  const data = await serverFetch("/ai/scan", {
    device_id: deviceId,
    image_base64: imageBase64,
    mime_type: mimeType,
    scan_type: scanType,
  });
  if (data.status === "error") {
    const err = new Error(data.message || "Gabim skanimi");
    err.code = data.code;
    throw err;
  }
  return data;
}

module.exports = {
  checkLicense,
  activateLicenseRemote,
  scanInvoiceViaServer,
  scanViaServerUnified,
  getDeviceId,
  getLicenseServerUrl,
};
