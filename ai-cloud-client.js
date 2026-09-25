const { getAiCloudUrl } = require("./ai-cloud-config");

async function cloudFetch(path, body, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getAiCloudUrl()}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || `Gabim serveri AI (${res.status})`);
      err.code = data.code || (res.status === 401 ? "invalid_license" : res.status === 403 ? "license_expired" : "cloud_error");
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
    if (e.cause?.code === "ENOTFOUND" || e.message?.includes("fetch failed")) {
      const err = new Error("❌ Serveri AI nuk është i arritshëm — kontrollo internetin");
      err.code = "network";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function validateLicense(licenseKey, { nui, businessName } = {}) {
  return cloudFetch("/v1/license/validate", {
    license_key: licenseKey,
    nui: nui || "",
    business_name: businessName || "",
    app: "revolution-kontabilisti",
  }, 20000);
}

async function scanInvoiceViaCloud(licenseKey, imageBase64, mimeType, meta = {}) {
  return cloudFetch("/v1/scan-invoice", {
    license_key: licenseKey,
    imageBase64,
    mimeType,
    nui: meta.nui || "",
    business_name: meta.businessName || "",
    app_version: meta.appVersion || "1.1.1",
  });
}

module.exports = { validateLicense, scanInvoiceViaCloud, getAiCloudUrl };
