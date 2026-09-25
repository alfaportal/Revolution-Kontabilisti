/**
 * Test ruajtje të dhënash — path AppData, backup, migrim, API
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const TEST_DIR = path.join(os.tmpdir(), `kont-data-test-${Date.now()}`);
process.env.KONTABILISTI_DATA_DIR = TEST_DIR;

function req(base, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(base + urlPath, {
      method,
      headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => resolve(JSON.parse(buf || "{}")));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const { getPaths, ensureDirs, DB_PATH, BACKUP_DIR_APPDATA, BACKUP_DIR_DAILY, BACKUP_DIR_MONTHLY } = require("../data-paths");
  const { initDatabase, getDb, DB_VERSION } = require("../database");
  const { createBackup, shouldAutoBackup, listBackups, createMonthlyBackupIfNeeded, runAutoBackups } = require("../data-backup");
  const { startOnPort, stopServer } = require("../server");

  let ok = 0;
  let fail = 0;
  const check = (label, cond) => {
    if (cond) { console.log("✅", label); ok++; }
    else { console.log("❌", label); fail++; }
  };

  ensureDirs();
  const p = getPaths();
  check("DATA_DIR në temp (jo __dirname)", p.DATA_DIR === TEST_DIR);
  check("DB_PATH në DATA_DIR", p.DB_PATH.startsWith(TEST_DIR));

  await initDatabase();
  getDb().prepare("INSERT OR REPLACE INTO db_meta (key,value) VALUES ('test','1')").run();

  const srv = await startOnPort(0);
  const base = `http://127.0.0.1:${srv.address().port}/api`;

  const info = await req(base, "GET", "/data/info");
  check("API /data/info", info.ok && info.db_path === DB_PATH);
  check("DB version", info.db_version === DB_VERSION);

  const bk = createBackup(getDb(), { manual: true });
  check("Backup manual", bk.results?.[0]?.ok && fs.existsSync(bk.path || bk.results[0].path));
  check("Backup folder root", fs.existsSync(BACKUP_DIR_APPDATA));
  check("Backup folder monthly", fs.existsSync(BACKUP_DIR_MONTHLY));
  check("List backups", listBackups().length >= 1);
  check("Backup emri YYYY-MM-DD_HH-mm", /kontabilisti_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db/.test(bk.name));
  check("Backup në backups/ (root)", bk.path.includes(`${path.sep}backups${path.sep}`) && !bk.path.includes(`${path.sep}daily${path.sep}`));

  const monthly = createMonthlyBackupIfNeeded(getDb());
  check("Backup mujor krijohet", monthly && /kontabilisti_\d{4}-\d{2}\.db/.test(monthly.name));
  check("Backup mujor në monthly/", monthly?.path.includes(`${path.sep}monthly${path.sep}`));
  check("Backup mujor nuk mbishkruhet", createMonthlyBackupIfNeeded(getDb()) === null);

  const auto = runAutoBackups(getDb());
  check("runAutoBackups", auto && typeof auto === "object");

  const info2 = await req(base, "GET", "/data/info");
  check("API backup_count_daily", typeof info2.backup_count_daily === "number");
  check("API backup_count_monthly", info2.backup_count_monthly >= 1);

  const notice = await req(base, "GET", "/app/update-notice");
  check("Update notice", notice.ok && Array.isArray(notice.notes));

  await req(base, "POST", "/backup", {});
  check("API POST /backup", (await req(base, "GET", "/backup/list")).rows.length >= 1);

  await stopServer();

  check("DB mbetet pas server stop", fs.existsSync(DB_PATH));

  console.log(`\n${ok} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
