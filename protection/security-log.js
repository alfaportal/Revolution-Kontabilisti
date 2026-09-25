const fs = require("fs");
const path = require("path");

function appendSecurityLog(dataDir, message) {
  try {
    const line = `[${new Date().toISOString()}] SECURITY: ${message}\n`;
    fs.appendFileSync(path.join(dataDir, "startup.log"), line, "utf8");
  } catch {
    /* ignore */
  }
}

module.exports = { appendSecurityLog };
