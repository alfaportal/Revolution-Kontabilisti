const { BrowserWindow } = require("electron");

function normalizeHtml(html, title = "Print") {
  const s = String(html || "");
  if (/^\s*<!DOCTYPE/i.test(s) || /^\s*<html/i.test(s)) return s;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${s}</body></html>`;
}

function loadHiddenWindow(html, title) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      title,
      webPreferences: { sandbox: true },
    });
    const doc = normalizeHtml(html, title);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`);
    win.webContents.once("did-finish-load", () => resolve(win));
    win.webContents.once("did-fail-load", () => {
      win.destroy();
      reject(new Error("Nuk u ngarkua dokumenti"));
    });
  });
}

function printHtml(html, title = "Print") {
  return new Promise((resolve, reject) => {
    loadHiddenWindow(html, title).then((win) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          pageSize: "A4",
          margins: { marginType: "custom", top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
        },
        (success, failureReason) => {
          win.destroy();
          if (!success) reject(new Error(failureReason || "Printimi dështoi"));
          else resolve({ ok: true });
        }
      );
    }).catch(reject);
  });
}

async function htmlToPdfBuffer(html, title = "PDF") {
  const win = await loadHiddenWindow(html, title);
  try {
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "custom", top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
  } finally {
    win.destroy();
  }
}

module.exports = { printHtml, htmlToPdfBuffer, normalizeHtml };
