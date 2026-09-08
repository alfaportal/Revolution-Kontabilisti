const express = require("express");
const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "kontabilisti-test", port: PORT });
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[TEST] Server listening on 0.0.0.0:${PORT}`);
});
