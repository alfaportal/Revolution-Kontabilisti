const SERVER_URL = process.env.KONTABILISTI_CLOUD_URL
  || process.env.KONTABILISTI_SERVER_URL
  || "https://revolution-pos.com/kontabilisti";

function getLicenseServerUrl() {
  return SERVER_URL.replace(/\/$/, "");
}

module.exports = { getLicenseServerUrl, SERVER_URL };
