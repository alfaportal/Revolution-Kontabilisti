function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  const secret = process.env.SERVER_SECRET || process.env.ADMIN_SECRET;
  if (!secret || key !== secret) {
    return res.status(403).json({ status: "error", message: "Forbidden" });
  }
  next();
}

module.exports = { requireAdmin };
