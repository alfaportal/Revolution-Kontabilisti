const { openDatabase } = require("./db-driver");
const { DB_PATH, ensureDirs } = require("./data-paths");
const { syncDeadlines } = require("./declaration-deadlines");
const { validateBusinessSettings } = require("./validators");

let db = null;
let initPromise = null;

const DB_VERSION = 1;

/** Migrime version-version — shto SQL këtu kur DB_VERSION rritet */
const migrations = {
  // 2: ["ALTER TABLE ..."],
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  business_legal_name TEXT,
  business_trade_name TEXT,
  business_type TEXT DEFAULT 'SH.P.K.',
  nui TEXT,
  fiscal_number TEXT,
  arbk TEXT,
  vat_number TEXT,
  registration_date TEXT,
  address TEXT,
  city TEXT,
  municipality TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Kosovë',
  phone TEXT,
  email TEXT,
  website TEXT,
  owner_name TEXT,
  owner_id_number TEXT,
  owner_phone TEXT,
  accountant_name TEXT,
  accountant_license TEXT,
  accountant_phone TEXT,
  accountant_email TEXT,
  declaration_period TEXT DEFAULT 'quarterly',
  fiscal_year INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS z_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  report_number TEXT,
  device_name TEXT,
  sales_18_total REAL DEFAULT 0,
  sales_18_base REAL DEFAULT 0,
  sales_18_vat REAL DEFAULT 0,
  sales_8_total REAL DEFAULT 0,
  sales_8_base REAL DEFAULT 0,
  sales_8_vat REAL DEFAULT 0,
  sales_0_total REAL DEFAULT 0,
  sales_0_vat REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  photo_path TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nui TEXT,
  fiscal_number TEXT,
  arbk TEXT,
  vat_number TEXT,
  address TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(nui)
);
CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  order_number TEXT,
  client_id INTEGER REFERENCES clients(id),
  client_name TEXT,
  client_nui TEXT,
  client_fiscal TEXT,
  client_address TEXT,
  subtotal REAL DEFAULT 0,
  vat_18 REAL DEFAULT 0,
  vat_8 REAL DEFAULT 0,
  vat_0_base REAL DEFAULT 0,
  vat_total REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'unpaid',
  amount_paid REAL DEFAULT 0,
  notes TEXT,
  payment_terms TEXT,
  photo_path TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES sales_invoices(id),
  item_number INTEGER,
  description TEXT NOT NULL,
  unit TEXT DEFAULT 'copë',
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  vat_rate REAL NOT NULL,
  vat_amount REAL DEFAULT 0,
  total_with_vat REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT,
  invoice_date TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_nui TEXT,
  supplier_fiscal TEXT,
  subtotal REAL DEFAULT 0,
  vat_18 REAL DEFAULT 0,
  vat_8 REAL DEFAULT 0,
  vat_total REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  photo_path TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES purchase_invoices(id),
  item_number INTEGER,
  description TEXT NOT NULL,
  unit TEXT DEFAULT 'copë',
  quantity REAL NOT NULL,
  unit_price_with_vat REAL NOT NULL,
  vat_rate REAL NOT NULL,
  base_price REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_number TEXT,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  has_vat INTEGER DEFAULT 0,
  vat_rate REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  receipt_number TEXT,
  supplier_name TEXT,
  photo_path TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS vat_declarations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type TEXT NOT NULL,
  period_label TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  data_json TEXT,
  status TEXT DEFAULT 'draft',
  submitted_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS declaration_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type TEXT,
  period_label TEXT,
  period_start TEXT,
  period_end TEXT,
  deadline_date TEXT,
  declaration_id INTEGER,
  status TEXT DEFAULT 'pending',
  submitted_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS db_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT OR IGNORE INTO db_meta VALUES ('version', '1');
INSERT OR IGNORE INTO settings (id) VALUES (1);
`;

async function initDatabase() {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    ensureDirs();
    const { db: opened } = await openDatabase(DB_PATH);
    db = opened;
    db.exec(SCHEMA);
    migrateDatabase(db);
    syncDeadlines(db, getSettings());
    return db;
  })();
  return initPromise;
}

function resetDatabaseConnection() {
  db = null;
  initPromise = null;
}

function getDb() {
  if (!db) throw new Error("Databaza nuk është inicializuar — thirr initDatabase()");
  return db;
}

function getSettings() {
  return getDb().prepare("SELECT * FROM settings WHERE id = 1").get();
}

function updateSettings(data) {
  const keys = Object.keys(data).filter((k) => k !== "id");
  if (!keys.length) return getSettings();
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  getDb().prepare(`UPDATE settings SET ${sets}, updated_at = datetime('now') WHERE id = 1`).run(data);
  syncDeadlines(getDb(), getSettings());
  return getSettings();
}

function settingsComplete(s) {
  return !!(s && validateBusinessSettings(s).valid);
}

function nextSequentialNumber(table, column, prefix, dateStr) {
  const year = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const fullPrefix = `${prefix}-${year}-`;
  const row = getDb().prepare(
    `SELECT ${column} as num FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`
  ).get(fullPrefix + "%");
  let n = 1;
  if (row?.num) {
    const part = String(row.num).split("-").pop();
    n = (parseInt(part, 10) || 0) + 1;
  }
  return fullPrefix + String(n).padStart(4, "0");
}

function nextInvoiceNumber(dateStr) {
  return nextSequentialNumber("sales_invoices", "invoice_number", "SH", dateStr);
}

function nextPurchaseNumber(dateStr) {
  return nextSequentialNumber("purchase_invoices", "internal_number", "BL", dateStr);
}

function nextExpenseNumber(dateStr) {
  return nextSequentialNumber("expenses", "expense_number", "SP", dateStr);
}

/** Numër global Z-Raport: Z-0001, Z-0002, … (përfshin edhe të anuluarit) */
function nextZReportNumber() {
  const rows = getDb().prepare(
    "SELECT report_number FROM z_reports WHERE report_number IS NOT NULL AND trim(report_number) != ''"
  ).all();
  let max = 0;
  for (const { report_number: num } of rows) {
    const m = String(num).trim().match(/^Z-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `Z-${String(max + 1).padStart(4, "0")}`;
}

function ensureColumnMigrations(d) {
  const cols = [
    ["purchase_invoices", "internal_number", "TEXT"],
    ["purchase_invoices", "supplier_invoice_number", "TEXT"],
    ["purchase_invoices", "vat_deductible", "INTEGER DEFAULT 1"],
    ["settings", "notify_on_startup", "INTEGER DEFAULT 1"],
    ["settings", "notify_days_reminder", "INTEGER DEFAULT 10"],
    ["settings", "notify_days_warning", "INTEGER DEFAULT 5"],
    ["settings", "notify_days_urgent", "INTEGER DEFAULT 2"],
    ["settings", "notify_banner", "INTEGER DEFAULT 1"],
    ["settings", "notify_badge", "INTEGER DEFAULT 1"],
    ["settings", "anthropic_api_key_enc", "TEXT"],
    ["settings", "ai_license_key_enc", "TEXT"],
    ["settings", "ai_license_activated", "INTEGER DEFAULT 0"],
    ["settings", "ai_license_expires_at", "TEXT"],
    ["settings", "license_key_enc", "TEXT"],
    ["settings", "license_device_id", "TEXT"],
    ["settings", "license_status", "TEXT"],
    ["settings", "license_expires_at", "TEXT"],
    ["settings", "license_scans_used", "INTEGER DEFAULT 0"],
    ["settings", "license_scans_limit", "INTEGER DEFAULT 500"],
    ["settings", "license_plan", "TEXT DEFAULT 'standard'"],
    ["settings", "license_last_check_at", "TEXT"],
    ["settings", "license_business_name", "TEXT"],
    ["settings", "license_key_display", "TEXT"],
  ];
  for (const [table, col, type] of cols) {
    try { d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* exists */ }
  }
  d.exec(`CREATE TABLE IF NOT EXISTS purchase_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_invoice_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    payment_date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}

function getDbVersion(d) {
  const row = d.prepare("SELECT value FROM db_meta WHERE key = 'version'").get();
  return parseInt(row?.value || "1", 10);
}

function migrateDatabase(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS db_meta (key TEXT PRIMARY KEY, value TEXT)`);
  d.exec(`INSERT OR IGNORE INTO db_meta VALUES ('version', '1')`);
  ensureColumnMigrations(d);

  let v = getDbVersion(d);
  for (let target = v + 1; target <= DB_VERSION; target++) {
    if (migrations[target]) {
      for (const sql of migrations[target]) {
        d.exec(sql);
      }
    }
    d.prepare("UPDATE db_meta SET value = ? WHERE key = 'version'").run(String(target));
    v = target;
  }
}

function getDatabaseVersion() {
  return getDbVersion(getDb());
}

module.exports = {
  initDatabase,
  getDb,
  resetDatabaseConnection,
  getSettings,
  updateSettings,
  settingsComplete,
  nextInvoiceNumber,
  nextPurchaseNumber,
  nextExpenseNumber,
  nextZReportNumber,
  getDatabaseVersion,
  DB_VERSION,
};
