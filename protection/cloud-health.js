/**
 * Cloud HTTP — Revolution Kontabilisti license API (publik).
 * https://revolution-pos.com/kontabilisti/api/license/*
 */
const https = require("https");
const http = require("http");
const { URL } = require("url");

const DEFAULT_BASE = "https://revolution-pos.com/kontabilisti";

function getBaseUrl() {
  return String(process.env.KONTABILISTI_CLOUD_URL || process.env.KONTABILISTI_SERVER_URL || DEFAULT_BASE)
    .replace(/\/+$/, "");
}

function requestJson(method, reqPath, payload = {}, { timeoutMs = 20000 } = {}) {
  const base = getBaseUrl();
  const u = new URL(reqPath.startsWith("http") ? reqPath : `${base}${reqPath}`);
  const body = JSON.stringify(payload || {});
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => resolve({ status: res.statusCode || 0, data }));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout lidhjeje me serverin e licencës."));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = { getBaseUrl, requestJson };
