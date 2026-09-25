const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");

/** DEV = burim i hapur; PROD = build i paketuar me mbrojtje */
if (app.isPackaged) {
  process.env.KONTABILISTI_PROTECTED = "1";
} else if (process.env.DEV_MODE !== "false") {
  process.env.DEV_MODE = "true";
}

const isProdProtected = () => process.env.KONTABILISTI_PROTECTED === "1" && process.env.DEV_MODE !== "true";

const { initElectronDataDir } = require("./data-paths");
initElectronDataDir();

const { ensureDirs, DATA_DIR, BACKUP_DIR_APPDATA } = require("./data-paths");
const { migrateLegacyData } = require("./data-migrate");
const { initDatabase, getDb, resetDatabaseConnection, getSettings, settingsComplete } = require("./database");
const { createBackup, runAutoBackups } = require("./data-backup");
const { exportFullZip, importFromZip, importFromDb } = require("./data-export");
const { printHtml, htmlToPdfBuffer } = require("./print-html");
const { startOnPort, stopServer, syncLicenseCacheFromCloud } = require("./server");
const pkg = require("./package.json");
const {
  bootKontabilistiLicense,
  runProdLicenseDialogUntilOk,
  NO_LICENSE_MSG,
} = require("./protection/license-boot");

let PORT = Number(process.env.KONTABILISTI_PORT) || 3972;
let mainWindow = null;
let quitting = false;
let dataDirty = false;
let pendingBackupNotice = null;
let _licenseUiSnap = "";
let _licenseReopenInProgress = false;

function broadcastToAllWindows(channel, payload) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    }
  } catch { /* ignore */ }
}

async function pushLicenseCacheAndNotifyUi(app, beat = {}) {
  try {
    await syncLicenseCacheFromCloud(app);
  } catch (e) {
    logStartup("license ui sync skip: " + (e.message || e));
  }
  const cloud = require("./protection/cloud-license");
  const rec = cloud.readActivationRecord(app) || {};
  const snap = JSON.stringify({
    plan: rec.plan || beat.plan,
    expires_at: rec.expires_at || beat.expires_at,
    license_key: rec.license_key,
    scans_used: beat.scans_used,
    scans_limit: beat.scans_limit,
  });
  if (snap === _licenseUiSnap) return;
  _licenseUiSnap = snap;
  const pkgPayload = {
    plan: rec.plan || beat.plan || "standard",
    expires_at: rec.expires_at || beat.expires_at,
    scans_used: beat.scans_used,
    scans_limit: beat.scans_limit,
    business_name: rec.business_name || beat.business_name,
  };
  broadcastToAllWindows("license:package-updated", pkgPayload);
  const key = String(rec.license_key || "").trim();
  if (key) broadcastToAllWindows("license:key-updated", { celesi: key });
}

function licenseFailReasonFromBeat(beat) {
  const cloud = require("./protection/cloud-license");
  if (cloud.isRevocationCode(beat?.code) || beat?.force_logout) return "revoked";
  if (beat?.code === "EXPIRED") return "expired";
  if (beat?.code === "OFFLINE_EXPIRED") return "offline_expired";
  return "no_license";
}

if (process.platform === "win32") {
  app.commandLine.appendSwitch("no-sandbox");
}

app.setName("Revolution Kontabilisti");
if (process.platform === "win32") {
  app.setAppUserModelId("com.revolution.kontabilisti");
}

function sendBackupNotice(payload) {
  if (mainWindow?.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send("backup:notice", payload);
  } else {
    pendingBackupNotice = payload;
  }
}

function logStartup(msg) {
  try {
    ensureDirs();
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(DATA_DIR, "startup.log"), line);
  } catch { /* ignore */ }
}

function resolveIcon() {
  const candidates = [
    path.join(__dirname, "assets", "icon.ico"),
    path.join(process.resourcesPath || "", "icon.ico"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function pickPort(preferred) {
  for (let p = preferred; p < preferred + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error("Asnjë port i lirë (3972–3991)");
}

function waitForServer(maxMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(800, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > maxMs) reject(new Error("Serveri nuk u nis (port " + PORT + ")"));
      else setTimeout(tryOnce, 200);
    };
    tryOnce();
  });
}

function applyProductionHardening(win) {
  if (!isProdProtected()) return;
  win.removeMenu();
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12"
      || (input.control && input.shift && ["I", "J", "C"].includes(input.key))
      || (input.control && input.key === "U")) {
      event.preventDefault();
    }
  });
  win.webContents.on("devtools-opened", () => {
    win.webContents.closeDevTools();
  });
}

async function clearRendererLicenseStorage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.webContents.executeJavaScript(`(function () {
      try { localStorage.clear(); sessionStorage.clear(); } catch (_e) {}
      return true;
    })()`, true);
  } catch { /* ignore */ }
}

async function relaunchMainAfterLicense() {
  PORT = await pickPort(PORT);
  process.env.KONTABILISTI_PORT = String(PORT);
  await startOnPort(PORT);
  await waitForServer();
  createWindow();
}

async function forceRevokeAndReactivate(detail, beat = {}) {
  if (_licenseReopenInProgress) return;
  _licenseReopenInProgress = true;
  logStartup(`license reopen dialog: ${detail || NO_LICENSE_MSG}`);
  try {
    const cloud = require("./protection/cloud-license");
    cloud.purgeAllLicenseArtifacts(app, detail || NO_LICENSE_MSG, { allowReactivation: true });
  } catch (e) {
    logStartup("license purge fail: " + (e.message || e));
  }
  _licenseUiSnap = "";
  await clearRendererLicenseStorage().catch(() => {});
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  } catch { /* ignore */ }
  mainWindow = null;
  await stopServer();

  const reason = licenseFailReasonFromBeat(beat);
  let activated = false;
  try {
    activated = await runProdLicenseDialogUntilOk(app, reason);
  } catch (e) {
    logStartup("license reactivation fail: " + (e.message || e));
  }

  _licenseReopenInProgress = false;

  if (activated) {
    try {
      await pushLicenseCacheAndNotifyUi(app, beat);
      await relaunchMainAfterLicense();
      const cloud = require("./protection/cloud-license");
      cloud.startLicenseWatchdog(app, onLicenseWatchdogBeat, onLicenseHeartbeatOk);
    } catch (e) {
      logStartup("license relaunch fail: " + (e.message || e));
      const retry = await runProdLicenseDialogUntilOk(app, reason);
      if (retry) {
        try {
          await pushLicenseCacheAndNotifyUi(app, beat);
          await relaunchMainAfterLicense();
          const cloud = require("./protection/cloud-license");
          cloud.startLicenseWatchdog(app, onLicenseWatchdogBeat, onLicenseHeartbeatOk);
        } catch (e2) {
          logStartup("license relaunch retry fail: " + (e2.message || e2));
          app.quit();
        }
      } else {
        app.quit();
      }
    }
    return;
  }
  /* Përdoruesi mbylli dialogun — quit pa ErrorBox */
  app.quit();
}

function onLicenseHeartbeatOk(beat) {
  if (beat?.offline) return;
  pushLicenseCacheAndNotifyUi(app, beat).catch(() => {});
}

function onLicenseWatchdogBeat(beat) {
  const cloud = require("./protection/cloud-license");
  if (beat?.valid) return;
  if (beat?.code === "NOT_FOUND") {
    try {
      cloud.wipeAllActivationData(app);
    } catch {
      /* ignore */
    }
    app.quit();
    return;
  }
  if (beat?.code && cloud.HARD_LICENSE_FAIL_CODES.has(beat.code)) {
    forceRevokeAndReactivate(beat?.message || NO_LICENSE_MSG, beat);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "Revolution Kontabilisti",
    backgroundColor: "#1a1a2e",
    show: false,
    autoHideMenuBar: true,
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
    if (pendingBackupNotice) {
      mainWindow.webContents.send("backup:notice", pendingBackupNotice);
      pendingBackupNotice = null;
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/${isProdProtected() ? "?protected=1" : ""}`);
  applyProductionHardening(mainWindow);
  mainWindow.webContents.on("console-message", (_e, _level, message, line, sourceId) => {
    if (message && !String(message).includes("DevTools")) {
      logStartup(`ui: ${message} (${sourceId}:${line})`);
    }
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    logStartup(`load fail ${code} ${desc} ${url}`);
  });
  mainWindow.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.webContents.send("app:close-request");
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

ipcMain.handle("backup:now", () => {
  try {
    return { ok: true, ...createBackup(getDb(), { manual: true }) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.on("data:mark-dirty", () => { dataDirty = true; });

ipcMain.handle("data:save-csv", async (_e, { filename, content }) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "Eksporto CSV",
    defaultPath: path.join(require("./data-paths").EXPORTS_DIR, filename || "export.csv"),
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  try {
    fs.writeFileSync(r.filePath, content, "utf8");
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("print:html", async (_e, { html, title }) => {
  try {
    await printHtml(html, title || "Print");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("print:pdf", async (_e, { html, title, filename }) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "Ruaj PDF",
    defaultPath: path.join(require("./data-paths").EXPORTS_DIR, filename || "raport.pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  try {
    const buf = await htmlToPdfBuffer(html, title || "PDF");
    fs.writeFileSync(r.filePath, buf);
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("data:restore-backup", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: "Rikthe nga backup",
    filters: [{ name: "Backup", extensions: ["db", "zip"] }],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths?.[0]) return { ok: false, cancelled: true };
  const file = r.filePaths[0];
  const stat = fs.statSync(file);
  const when = stat.mtime.toLocaleString("sq-AL");
  return {
    ok: true,
    needConfirm: true,
    file,
    fileName: path.basename(file),
    fileDate: when,
  };
});

ipcMain.handle("data:restore-confirmed", async (_e, { file }) => {
  if (!file) return { ok: false, error: "Mungon skedari" };
  try {
    const { restoreBackup } = require("./data-backup");
    if (file.toLowerCase().endsWith(".zip")) {
      createBackup(getDb(), { manual: true });
      importFromZip(file);
    } else {
      restoreBackup(file);
    }
    await initDatabase();
    dataDirty = false;
    return { ok: true, restart: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("app:quit", async (_e, { withBackup } = {}) => {
  quitting = true;
  if (withBackup || dataDirty) {
    try {
      const bk = createBackup(getDb(), withBackup ? { manual: true } : { auto: true });
      if (bk.message) sendBackupNotice({ ok: true, message: bk.message, ms: 3000 });
    } catch {
      sendBackupNotice({ ok: false, message: "❌ Backup dështoi — kontrolloni hapësirën në disk", ms: 4000 });
    }
  }
  await stopServer();
  app.quit();
});

ipcMain.handle("app:version", () => pkg.version);

ipcMain.handle("license:open-dialog", async () => {
  const cloud = require("./protection/cloud-license");
  const { isProdLicenseSatisfied } = require("./protection/license-boot");
  if (isProdProtected() && await isProdLicenseSatisfied(cloud, app)) {
    await pushLicenseCacheAndNotifyUi(app);
    return { ok: true, active: true };
  }
  const licenseGuard = require("./license-guard");
  const ok = isProdProtected()
    ? await runProdLicenseDialogUntilOk(app, "no_license")
    : await licenseGuard.promptHardwareActivation(app, { reason: "no_license" });
  if (ok) {
    await pushLicenseCacheAndNotifyUi(app);
    return { ok: true, active: true };
  }
  return { ok: false, active: false };
});

ipcMain.handle("data:export-zip", async () => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "Eksporto të dhënat",
    defaultPath: path.join(require("./data-paths").EXPORTS_DIR, `kontabilisti_export_${new Date().toISOString().slice(0, 10)}.zip`),
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  try {
    return { ok: true, ...exportFullZip(r.filePath) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("data:import", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: "Importo backup",
    filters: [{ name: "Backup", extensions: ["db", "zip"] }],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths?.[0]) return { ok: false, cancelled: true };
  const file = r.filePaths[0];
  try {
    const result = file.toLowerCase().endsWith(".zip")
      ? importFromZip(file)
      : importFromDb(file);
    await initDatabase();
    return { ok: true, ...result, restart: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("data:open-backup-folder", async () => {
  ensureDirs();
  await shell.openPath(BACKUP_DIR_APPDATA);
  return { ok: true };
});

ipcMain.handle("app:factory-reset", async (_e, { password, confirmWord } = {}) => {
  const { validateFactoryResetAuth, executeFactoryReset } = require("./factory-reset");
  const auth = validateFactoryResetAuth({ password, confirmWord });
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    executeFactoryReset(getDb);
    dataDirty = false;
    quitting = true;
    await stopServer();
    app.relaunch();
    app.quit();
    return { ok: true, restarting: true };
  } catch (e) {
    return { ok: false, error: e.message || "Gabim factory reset" };
  }
});

app.whenReady().then(async () => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  try {
    logStartup("start");
    ensureDirs();

    const mig = migrateLegacyData(logStartup);
    if (mig.migrated) logStartup("migration complete");

    await initDatabase();
    logStartup("db ok — " + require("./data-paths").DB_PATH);

    try {
      const settings = getSettings();
      if (settingsComplete(settings)) {
        const { syncBusinessDataFolder } = require("./data-paths");
        const sync = syncBusinessDataFolder(settings);
        if (sync.moved) {
          logStartup(`data folder → ${sync.folder} (${sync.to})`);
          resetDatabaseConnection();
          await initDatabase();
          logStartup("db reloaded after folder sync");
        } else if (sync.folder) {
          logStartup(`data folder: ${sync.folder}`);
        }
      }
    } catch (e) {
      logStartup("data folder sync skip: " + e.message);
    }

    const { runSecurityChecks } = require("./protection/security-startup");
    const sec = runSecurityChecks({
      appRoot: __dirname,
      dataDir: DATA_DIR,
      getDb,
      dialog,
      app,
    });
    if (!sec.ok) {
      logStartup(`security blocked step=${sec.step || "?"}`);
      app.quit();
      return;
    }

    const licenseOk = await bootKontabilistiLicense(app, {
      isProd: isProdProtected(),
      onRevoke: onLicenseWatchdogBeat,
      onHeartbeatOk: onLicenseHeartbeatOk,
    });
    if (!licenseOk) {
      logStartup("license boot — user closed dialog");
      app.quit();
      return;
    }
    if (isProdProtected()) {
      try {
        await pushLicenseCacheAndNotifyUi(app);
        logStartup("license cache synced");
      } catch (e) {
        logStartup("license cache sync skip: " + e.message);
      }
    }

    PORT = await pickPort(PORT);
    process.env.KONTABILISTI_PORT = String(PORT);
    logStartup("port " + PORT);

    await startOnPort(PORT);
    await waitForServer();
    logStartup("server ok");
    createWindow();

    setImmediate(() => {
      try {
        const db = getDb();
        const bk = runAutoBackups(db);
        if (bk.daily) {
          logStartup(bk.daily.message || "backup auto ok");
          sendBackupNotice({ ok: true, message: bk.daily.message, ms: 3000 });
        } else if (bk.monthly) {
          logStartup(bk.monthly.message || "backup mujor ok");
        }
        if (bk.error) {
          logStartup("backup FAIL: " + bk.error);
          sendBackupNotice({ ok: false, message: "❌ Backup dështoi — kontrolloni hapësirën në disk", ms: 4000 });
        }
      } catch (e) {
        logStartup("backup skip: " + e.message);
        sendBackupNotice({ ok: false, message: "❌ Backup dështoi — kontrolloni hapësirën në disk", ms: 4000 });
      }
    });
  } catch (e) {
    logStartup("FAIL: " + (e.stack || e.message));
    dialog.showErrorBox(
      "Revolution Kontabilisti — gabim",
      (e.message || String(e)) + "\n\nLog: %AppData%\\Kontabilisti\\startup.log"
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  quitting = true;
  await stopServer();
});
