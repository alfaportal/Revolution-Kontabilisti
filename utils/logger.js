function info(...args) { console.log("[INFO]", ...args); }
function warn(...args) { console.warn("[WARN]", ...args); }
function error(...args) { console.error("[ERROR]", ...args); }
function debug(...args) {
  if (process.env.DEBUG) console.log("[DEBUG]", ...args);
}

module.exports = { info, warn, error, debug };
