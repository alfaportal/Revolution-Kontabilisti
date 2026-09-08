function normalizeDeviceId(id) {
  return String(id || "").trim().toUpperCase().replace(/\s+/g, "");
}

function isValidDeviceId(id) {
  const n = normalizeDeviceId(id);
  return /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(n);
}

function deviceMatches(a, b) {
  return normalizeDeviceId(a) === normalizeDeviceId(b);
}

module.exports = { normalizeDeviceId, isValidDeviceId, deviceMatches };
