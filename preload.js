const { contextBridge, ipcRenderer } = require("electron");

function subscribeIpc(channel, callback) {
  const handler = (_event, payload) => {
    if (typeof callback === "function") callback(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("kontabilisti", {
  backupNow: () => ipcRenderer.invoke("backup:now"),
  quit: (opts) => ipcRenderer.invoke("app:quit", opts),
  exportDataZip: () => ipcRenderer.invoke("data:export-zip"),
  importData: () => ipcRenderer.invoke("data:import"),
  restoreBackup: () => ipcRenderer.invoke("data:restore-backup"),
  restoreBackupConfirmed: (file) => ipcRenderer.invoke("data:restore-confirmed", { file }),
  openBackupFolder: () => ipcRenderer.invoke("data:open-backup-folder"),
  factoryReset: (opts) => ipcRenderer.invoke("app:factory-reset", opts),
  saveCsv: (filename, content) => ipcRenderer.invoke("data:save-csv", { filename, content }),
  printHtml: (html, title) => ipcRenderer.invoke("print:html", { html, title }),
  savePdf: (html, title, filename) => ipcRenderer.invoke("print:pdf", { html, title, filename }),
  appVersion: () => ipcRenderer.invoke("app:version"),
  markDataDirty: () => ipcRenderer.send("data:mark-dirty"),
  openLicenseDialog: () => ipcRenderer.invoke("license:open-dialog"),
  onLicensePackageUpdated: (callback) => subscribeIpc("license:package-updated", callback),
  onLicenseKeyUpdated: (callback) => subscribeIpc("license:key-updated", callback),
  onCloseRequest: (cb) => {
    ipcRenderer.on("app:close-request", cb);
    return () => ipcRenderer.removeListener("app:close-request", cb);
  },
  onBackupNotice: (cb) => {
    ipcRenderer.on("backup:notice", (_e, payload) => cb(payload));
    return () => ipcRenderer.removeListener("backup:notice", cb);
  },
});
