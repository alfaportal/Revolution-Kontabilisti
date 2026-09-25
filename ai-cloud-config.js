/** URL i serverit AI (Railway) — vendoset me env në prod */
const DEFAULT_AI_CLOUD_URL = "https://revolution-kontabilisti-ai.up.railway.app";

function getAiCloudUrl() {
  const url = (process.env.KONTABILISTI_AI_CLOUD_URL || DEFAULT_AI_CLOUD_URL).replace(/\/$/, "");
  return url;
}

module.exports = { getAiCloudUrl, DEFAULT_AI_CLOUD_URL };
