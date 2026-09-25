/**
 * Test factory reset — vetëm lokal, pa prekur backup-et.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

function makeReq(port) {
  return (method, urlPath, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api" + urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(buf || "{}") }); }
        catch { resolve({ status: res.statusCode, raw: buf }); }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const dataDir = path.join(os.tmpdir(), `fr-test-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.KONTABILISTI_DATA_DIR = dataDir;
  process.env.KONTABILISTI_DB_PATH = path.join(dataDir, "kontabilisti.db");

  delete require.cache[require.resolve("../database")];
  delete require.cache[require.resolve("../server")];

  const { initDatabase, getDb, updateSettings } = require("../database");
  await initDatabase();
  const db = getDb();

  updateSettings({
    business_legal_name: "Test Biz",
    business_trade_name: "TB",
    business_type: "SH.P.K.",
    nui: "811111111",
    fiscal_number: "811111111",
    arbk: "12345678",
    registration_date: "2020-01-01",
    address: "Rr. Test",
    city: "Prishtinë",
    municipality: "Prishtinë",
    phone: "044111222",
    email: "test@test.com",
    owner_name: "Owner",
    owner_id_number: "1234567890",
  });

  db.prepare("INSERT INTO clients(name,nui) VALUES (?,?)").run("Klient", "111111111");
  db.prepare("INSERT INTO z_reports(report_date,report_number,grand_total,status) VALUES (?,?,?,?)")
    .run("2026-08-01", "Z-0001", 100, "active");

  fs.mkdirSync(path.join(dataDir, "backups", "daily"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "backups", "daily", "keep.db"), "backup");
  fs.mkdirSync(path.join(dataDir, "scans", "z-reports"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "scans", "z-reports", "x.jpg"), "photo");
  fs.mkdirSync(path.join(dataDir, "invoices", "2026-08"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "invoices", "2026-08", "f.jpg"), "inv");
  fs.writeFileSync(path.join(dataDir, "license.json"), "{}");

  const { startOnPort, stopServer } = require("../server");
  const srv = await startOnPort(0);
  const req = makeReq(srv.address().port);

  const bad = await req("POST", "/admin/factory-reset", { confirmWord: "RIVENDOS", password: "wrong" });
  const good = await req("POST", "/admin/factory-reset", { confirmWord: "RIVENDOS", password: "REVOLUTION2026!" });

  const z = db.prepare("SELECT COUNT(*) as c FROM z_reports").get().c;
  const cl = db.prepare("SELECT COUNT(*) as c FROM clients").get().c;
  const s = db.prepare("SELECT business_legal_name, nui FROM settings WHERE id=1").get();
  const bk = fs.existsSync(path.join(dataDir, "backups", "daily", "keep.db"));
  const scan = fs.existsSync(path.join(dataDir, "scans", "z-reports", "x.jpg"));
  const inv = fs.existsSync(path.join(dataDir, "invoices", "2026-08", "f.jpg"));
  const lic = fs.existsSync(path.join(dataDir, "license.json"));
  const log = fs.readFileSync(path.join(dataDir, "startup.log"), "utf8");
  const nextZ = (await req("GET", "/next-z-report-number")).number;
  const complete = (await req("GET", "/settings")).complete;

  const ok = bad.status === 403
    && good.ok === true
    && z === 0 && cl === 0
    && !s.business_legal_name && !s.nui
    && bk && !scan && !inv && !lic
    && nextZ === "Z-0001"
    && complete === false
    && log.includes("FACTORY RESET")
    && log.includes("Test Biz");

  console.log(JSON.stringify({
    ok,
    badStatus: bad.status,
    badErr: bad.error,
    goodOk: good.ok,
    z,
    cl,
    settings: s,
    backupKept: bk,
    scanRemoved: !scan,
    invoiceRemoved: !inv,
    licenseRemoved: !lic,
    nextZ,
    wizardIncomplete: !complete,
    logLine: log.trim().split("\n").pop(),
  }, null, 2));

  await stopServer();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
