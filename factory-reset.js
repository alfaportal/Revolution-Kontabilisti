/**
 * Factory reset — fshin të dhënat e biznesit, mbaj backup-et.
 * Vetëm me fjalëkalimin e administratorit (Naseri).
 */
const fs = require("fs");
const path = require("path");
const { ensureDirs, DATA_DIR, SCANS_DIR, INVOICES_DIR, LICENSE_PATH } = require("./data-paths");
const { syncDeadlines } = require("./declaration-deadlines");

const ADMIN_PASSWORD = "REVOLUTION2026!";
const CONFIRM_WORD = "RIVENDOS";

const RESET_TABLES = [
  "sales_invoice_items",
  "sales_invoices",
  "purchase_payments",
  "purchase_invoice_items",
  "purchase_invoices",
  "z_report_items",
  "z_reports",
  "expenses",
  "vat_declarations",
  "declaration_deadlines",
  "clients",
];

const SEQUENCE_TABLES = [
  "z_reports",
  "sales_invoices",
  "purchase_invoices",
  "expenses",
  "vat_declarations",
  "clients",
  "purchase_payments",
  "sales_invoice_items",
  "purchase_invoice_items",
];

function validateFactoryResetAuth({ password, confirmWord }) {
  if (String(confirmWord || "").trim() !== CONFIRM_WORD) {
    return { ok: false, error: "Konfirmimi nuk është i saktë." };
  }
  if (String(password || "") !== ADMIN_PASSWORD) {
    return { ok: false, error: "Fjalëkalimi nuk është i saktë. Kontaktoni administratorin." };
  }
  return { ok: true };
}

function appendStartupLog(line) {
  ensureDirs();
  fs.appendFileSync(path.join(DATA_DIR, "startup.log"), `${line}\n`, "utf8");
}

function emptyDirContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) {
      emptyDirContents(full);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
}

function executeFactoryReset(getDb) {
  const db = getDb();
  const settings = db.prepare("SELECT business_legal_name, nui FROM settings WHERE id=1").get() || {};
  const bizName = settings.business_legal_name || "—";
  const nui = settings.nui || "—";
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const logLine = `[${ts}] FACTORY RESET ekzekutuar — të dhënat e biznesit "${bizName}" (NUI: ${nui}) u fshinë`;
  appendStartupLog(logLine);

  for (const table of RESET_TABLES) {
    try {
      db.exec(`DELETE FROM ${table}`);
    } catch {
      /* tabelë që mund të mungojë */
    }
  }

  db.exec("DELETE FROM settings WHERE id=1");
  db.exec("INSERT INTO settings (id) VALUES (1)");

  try {
    const placeholders = SEQUENCE_TABLES.map(() => "?").join(", ");
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...SEQUENCE_TABLES);
  } catch {
    /* ignore */
  }

  emptyDirContents(SCANS_DIR);
  emptyDirContents(INVOICES_DIR);
  ensureDirs();

  try {
    if (fs.existsSync(LICENSE_PATH)) fs.unlinkSync(LICENSE_PATH);
  } catch {
    /* ignore */
  }

  try {
    db.exec("DELETE FROM db_meta WHERE key='bound_device_id'");
  } catch {
    /* ignore */
  }

  syncDeadlines(db, db.prepare("SELECT * FROM settings WHERE id=1").get());

  return { ok: true, logLine };
}

module.exports = {
  ADMIN_PASSWORD,
  CONFIRM_WORD,
  validateFactoryResetAuth,
  executeFactoryReset,
};
