/**
 * Auth për bridge nga Super Admin (telefon) — x-admin-secret si Fiskalizim/Security.
 */
const DEFAULT_ADMIN_SECRET = "naser-kontabilisti-2026";

function acceptedAdminSecrets() {
  return new Set(
    [
      process.env.SUPER_ADMIN_SECRET,
      process.env.ADMIN_SECRET,
      process.env.SERVER_SECRET,
      DEFAULT_ADMIN_SECRET,
    ]
      .map((s) => String(s || "").trim())
      .filter(Boolean),
  );
}

function requireBridgeAdmin(req, res, next) {
  const provided = String(
    req.get("x-admin-secret") || req.get("x-admin-key") || req.body?.secret || req.query?.secret || "",
  ).trim();
  const secrets = acceptedAdminSecrets();
  if (provided && secrets.has(provided)) {
    return next();
  }
  return res.status(401).json({
    ok: false,
    status: "error",
    message: "Unauthorized — secret i Super Admin.",
    code: "ADMIN_AUTH",
  });
}

module.exports = { requireBridgeAdmin, DEFAULT_ADMIN_SECRET };
