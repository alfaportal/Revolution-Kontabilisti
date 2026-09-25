/**
 * SQLite driver — provon better-sqlite3, pastaj sql.js.
 */
const fs = require("fs");
const path = require("path");
const { readDbFile, writeDbFile } = require("./protection/db-crypto");

function namedToPositional(sql, obj) {
  const params = [];
  const converted = sql.replace(/@(\w+)/g, (_, name) => {
    params.push(obj[name]);
    return "?";
  });
  return { sql: converted, params };
}

function lastId(db) {
  // sql.js: db.exec reliably returns last_insert_rowid after db.run(INSERT…)
  const res = db.exec("SELECT last_insert_rowid() AS id");
  if (res?.[0]?.values?.[0]?.[0] != null) {
    return Number(res[0].values[0][0]) || 0;
  }
  const stmt = db.prepare("SELECT last_insert_rowid() AS id");
  try {
    if (!stmt.step()) return 0;
    const row = stmt.getAsObject();
    const v = row.id ?? row.ID ?? Object.values(row)[0];
    return Number(v) || 0;
  } finally {
    stmt.free();
  }
}

function wrapSqlJsDatabase(db, dbPath) {
  let inTx = 0;

  function persist() {
    if (inTx > 0) return;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const exported = Buffer.from(db.export());
    writeDbFile(dbPath, exported, fs);
  }

  function prepareStmt(sql) {
    return {
      run(...args) {
        let q = sql;
        let params = args;
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
          const c = namedToPositional(sql, args[0]);
          q = c.sql;
          params = c.params;
        }
        db.run(q, params);
        const insertedId = lastId(db);
        persist();
        return { lastInsertRowid: insertedId };
      },
      get(...args) {
        let q = sql;
        let params = args;
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
          const c = namedToPositional(sql, args[0]);
          q = c.sql;
          params = c.params;
        }
        const stmt = db.prepare(q);
        try {
          stmt.bind(params);
          if (stmt.step()) return stmt.getAsObject();
          return undefined;
        } finally {
          stmt.free();
        }
      },
      all(...args) {
        let q = sql;
        let params = args;
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
          const c = namedToPositional(sql, args[0]);
          q = c.sql;
          params = c.params;
        }
        const stmt = db.prepare(q);
        const rows = [];
        try {
          stmt.bind(params);
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      },
    };
  }

  return {
    engine: "sql.js",
    exec(sql) {
      db.exec(sql);
      persist();
    },
    pragma() { /* no-op */ },
    prepare: prepareStmt,
    transaction(fn) {
      return (...args) => {
        inTx++;
        db.run("BEGIN");
        try {
          const result = fn(...args);
          db.run("COMMIT");
          inTx--;
          persist();
          return result;
        } catch (e) {
          db.run("ROLLBACK");
          inTx--;
          throw e;
        }
      };
    },
  };
}

async function openDatabase(dbPath) {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return { db, engine: "better-sqlite3" };
  } catch {
    const initSqlJs = require("sql.js");
    const rel = path.join("node_modules", "sql.js", "dist", "sql-wasm.wasm");
    const candidates = [
      path.join(process.resourcesPath || "", "sql-wasm.wasm"),
      path.join(process.resourcesPath || "", "app.asar.unpacked", rel),
      path.join(process.resourcesPath || "", "app", rel),
      path.join(__dirname, rel),
    ];
    const wasmPath = candidates.find((p) => p && fs.existsSync(p));
    if (!wasmPath) {
      throw new Error("sql-wasm.wasm nuk u gjet. Kontrollo instalimin.");
    }
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    let data = null;
    if (fs.existsSync(dbPath)) {
      try {
        data = readDbFile(dbPath, fs);
      } catch (e) {
        throw new Error("Databaza e enkriptuar nuk u hap — pajisja ose skedari nuk përputhet.");
      }
    }
    const raw = data ? new SQL.Database(data) : new SQL.Database();
    return { db: wrapSqlJsDatabase(raw, dbPath), engine: "sql.js" };
  }
}

module.exports = { openDatabase };
