/**
 * Hardware + cloud license guard — Revolution Kontabilisti (main process).
 * SECRET_SALT i ndarë nga Fiskalizim / Security.
 */
const path = require("path");

const PROTECTION_DIR = path.join(__dirname, "protection");
const CONTACT_PHONE = "+383 48707880";
const CONTACT_WHATSAPP = "38348707880";

function getSecretSalt() {
  return Buffer.from("Uk9OVUxVTklPTi1LT05UQUJJTElTVEktSExXQ0stMjAyNi1OQVNFUi1iN2QyZWUxMg==", "base64").toString("utf8");
}

function getHardwareId(app) {
  const { getDeviceId } = require("./license-hardware");
  return getDeviceId(app);
}

function formatHardwareId(id) {
  const s = String(id || "").trim().toUpperCase();
  if (/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(s)) return s;
  const hex = s.replace(/[^A-F0-9]/g, "").slice(0, 16).padEnd(16, "0");
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join("-");
}

function buildWhatsAppActivationUrl(hardwareId, email) {
  const hw = formatHardwareId(hardwareId) || "—";
  const em = String(email || "").trim();
  const lines = [
    "Pershendetje Revolution Invest,",
    `ID pajisje per aktivizim Kontabilisti: ${hw}`,
    em ? `Email: ${em}` : null,
    "Ju lutem me regjistroni licencen per kete Hardware ID.",
  ].filter(Boolean);
  return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function isPackagedApp(app) {
  if (app && typeof app.isPackaged === "boolean") return app.isPackaged;
  try {
    const { app: electronApp } = require("electron");
    return !!electronApp?.isPackaged;
  } catch {
    return process.env.KONTABILISTI_PROTECTED === "1";
  }
}

function promptHardwareActivation(app, opts = {}) {
  return new Promise((resolve) => {
    const { BrowserWindow, ipcMain, shell } = require("electron");
    const hwFormatted = formatHardwareId(getHardwareId(app));
    const reason = String(opts.reason || "");
    let subText = "Programi hapet vetëm pasi të aktivizohet për këtë kompjuter.";
    if (reason === "revoked") {
      subText = "Licenca u hoq ose u suspendua. Dërgoni Hardware ID te admini dhe prisni aktivizimin, ose futni çelësin e licencës.";
    } else if (reason === "expired") {
      subText = "Licenca ka skaduar. Kontaktoni adminin për rinovim ose futni çelësin e ri.";
    } else if (reason === "offline_expired") {
      subText = "Pa internet më shumë se 7 ditë. Lidhuni online dhe prisni aktivizimin, ose futni çelësin.";
    } else if (reason === "no_license") {
      subText = "Nuk ka licencë aktive për këtë kompjuter. Dërgoni Hardware ID te admini.";
    }

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      try {
        ipcMain.removeHandler("kont-lic-try");
        ipcMain.removeHandler("kont-lic-close");
        ipcMain.removeHandler("kont-lic-whatsapp");
        ipcMain.removeHandler("kont-lic-poll-cloud");
        ipcMain.removeHandler("kont-lic-help");
      } catch { /* ignore */ }
      try {
        if (win && !win.isDestroyed()) win.destroy();
      } catch { /* ignore */ }
      resolve(!!ok);
    };

    const win = new BrowserWindow({
      width: 560,
      height: 720,
      resizable: true,
      minimizable: true,
      maximizable: false,
      closable: true,
      show: false,
      center: true,
      backgroundColor: "#0f172a",
      alwaysOnTop: true,
      title: "Aktivizo Revolution Kontabilisti",
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    win.once("ready-to-show", () => { try { win.show(); win.focus(); } catch { /* ignore */ } });
    try { win.setMenuBarVisibility(false); } catch { /* ignore */ }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;font-family:"Segoe UI",Tahoma,sans-serif;background:linear-gradient(160deg,#0f172a 0%,#1e293b 55%,#0f172a 100%);color:#e2e8f0}
      .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
      .card{position:relative;width:min(520px,100%);background:rgba(15,23,42,.92);border:1px solid #334155;border-radius:16px;padding:32px 28px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
      .btn-close{position:absolute;top:12px;right:12px;width:40px;height:40px;margin:0;padding:0;border:1px solid #475569;border-radius:10px;background:#0f172a;color:#e2e8f0;font-size:1.35rem;line-height:1;cursor:pointer}
      h1{margin:0 40px 8px 0;font-size:1.45rem;font-weight:700;letter-spacing:.02em}
      .sub{margin:0 0 16px;color:#94a3b8;font-size:.95rem;line-height:1.45}
      .label{font-size:.8rem;color:#94a3b8;margin:0 0 6px;text-transform:uppercase;letter-spacing:.06em}
      .id{font-family:Consolas,monospace;font-size:1.15rem;letter-spacing:.14em;background:#020617;border:1px solid #475569;border-radius:10px;padding:14px 12px;text-align:center;margin:0 0 10px;user-select:all}
      .row{display:flex;gap:8px;margin:0 0 14px}
      .row button{flex:1;padding:10px;font-size:.9rem;font-weight:600;border:none;border-radius:10px;cursor:pointer}
      .btn-wa{background:#128C7E;color:#fff}
      input{width:100%;box-sizing:border-box;padding:14px 12px;font-size:1.05rem;text-align:center;border:2px solid #475569;border-radius:10px;background:#020617;color:#f8fafc;margin:0 0 12px}
      input.key{letter-spacing:.08em}
      input:focus{outline:none;border-color:#38bdf8}
      button.primary{margin-top:8px;width:100%;padding:14px;font-size:1.05rem;font-weight:600;background:#2563eb;color:#fff;border:none;border-radius:10px;cursor:pointer}
      button.primary:disabled{background:#64748b;cursor:wait}
      button.ghost{margin-top:10px;width:100%;padding:12px;font-size:.95rem;font-weight:600;background:transparent;color:#cbd5e1;border:1px solid #475569;border-radius:10px;cursor:pointer}
      button.ghost:hover{border-color:#94a3b8;color:#fff}
      .err{color:#f87171;min-height:1.3em;margin-top:10px;font-size:.9rem;white-space:pre-wrap}
      .phone{margin-top:14px;padding-top:14px;border-top:1px solid #334155;color:#cbd5e1;font-size:.95rem;line-height:1.45}
      .phone b{color:#25D366}
      .help-link{margin-top:14px;text-align:center;font-size:.9rem}
      .help-link a{color:#38bdf8;text-decoration:none;cursor:pointer}
      .help-link a:hover{text-decoration:underline;color:#7dd3fc}
    </style></head><body><div class="wrap"><div class="card">
      <button type="button" class="btn-close" id="x">×</button>
      <h1>Aktivizo Revolution Kontabilisti</h1>
      <p class="sub">${subText.replace(/</g, "&lt;")}</p>
      <p class="label">ID i pajisjes — dërgoni foto në WhatsApp</p>
      <div class="id" id="hw">${hwFormatted}</div>
      <div class="row"><button type="button" class="btn-wa" id="wa">Dërgo në WhatsApp</button></div>
      <p class="label">Email-i i përdoruesit</p>
      <input id="email" type="email" placeholder="p.sh. emri@email.com" autocomplete="email" spellcheck="false">
      <p class="label">Çelësi i licencës</p>
      <input id="k" class="key" type="text" placeholder="Shkruaj ose ngjit çelësin" autocomplete="off" spellcheck="false">
      <div class="err" id="e"></div>
      <button type="button" class="primary" id="b">Aktivizo</button>
      <button type="button" class="ghost" id="c">Mbyll</button>
      <p class="phone">WhatsApp / tel: <b>${CONTACT_PHONE}</b><br>Duke kontrolluar cloud çdo 3 sek…</p>
      <p class="help-link"><a href="#" id="help-lic">Rikthejnë ose ngeli gabim?</a></p>
    </div></div>
    <script>
      const { ipcRenderer } = require('electron');
      const btn = document.getElementById('b');
      const err = document.getElementById('e');
      const input = document.getElementById('k');
      const emailEl = document.getElementById('email');
      function isEmail(v){ return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v||'').trim()); }
      function quitApp(){ ipcRenderer.invoke('kont-lic-close').catch(()=>{}); }
      document.getElementById('x').onclick = quitApp;
      document.getElementById('c').onclick = quitApp;
      document.getElementById('wa').onclick = () => {
        ipcRenderer.invoke('kont-lic-whatsapp', {
          hardware_id: document.getElementById('hw').textContent,
          email: emailEl.value,
        }).catch(()=>{});
      };
      document.getElementById('help-lic').onclick = (ev) => {
        ev.preventDefault();
        ipcRenderer.invoke('kont-lic-help', {
          hardware_id: document.getElementById('hw').textContent,
          email: emailEl.value,
        }).catch(()=>{});
      };
      async function submit(){
        const email = String(emailEl.value||'').trim();
        const v = String(input.value||'').trim();
        if (!isEmail(email)) { err.textContent='Shkruani email të vlefshëm.'; emailEl.focus(); return; }
        if (!v) { err.textContent='Futni çelësin ose prisni regjistrimin e HW ID nga admini.'; return; }
        btn.disabled=true; btn.textContent='Duke verifikuar...'; err.textContent='';
        try {
          const r = await ipcRenderer.invoke('kont-lic-try', { key: v, email });
          if (r && r.ok) return;
          err.textContent = (r && r.message) || 'Çelësi nuk u pranua.';
        } catch(e){ err.textContent = e.message || String(e); }
        btn.disabled=false; btn.textContent='Aktivizo';
      }
      btn.onclick = submit;
      input.addEventListener('keydown', e => { if (e.key==='Enter' && !btn.disabled) submit(); if (e.key==='Escape') quitApp(); });
      setInterval(async () => {
        try {
          const r = await ipcRenderer.invoke('kont-lic-poll-cloud');
          if (r && r.ok) err.textContent = 'Licenca u aktivizua automatikisht ✅';
        } catch(_e){}
      }, 3000);
      setTimeout(()=>emailEl.focus(), 80);
    </script></body></html>`;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    function syncLocalLicenseCache() {
      try {
        const { syncLicenseCacheFromCloud } = require("./server");
        syncLicenseCacheFromCloud(app).catch(() => {});
      } catch { /* server nuk është gati në boot — main e sinkronizon pas */ }
    }

    ipcMain.handle("kont-lic-help", async (_e, payload) => {
      try {
        const hw = String(payload?.hardware_id || hwFormatted).trim();
        const em = String(payload?.email || "").trim();
        const lines = [
          "Pershendetje Revolution Invest,",
          "Kam problem me aktivizimin e Revolution Kontabilisti (rikthim licence ose gabim).",
          `Hardware ID: ${hw}`,
          em ? `Email: ${em}` : null,
        ].filter(Boolean);
        await shell.openExternal(`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err.message || String(err) };
      }
    });

    ipcMain.handle("kont-lic-whatsapp", async (_e, payload) => {
      try {
        await shell.openExternal(buildWhatsAppActivationUrl(payload?.hardware_id, payload?.email));
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err.message || String(err) };
      }
    });

    ipcMain.handle("kont-lic-poll-cloud", async () => {
      try {
        const cloud = require(path.join(PROTECTION_DIR, "cloud-license"));
        const claimed = await cloud.claimByHardwareId(app);
        if (claimed?.valid) {
          syncLocalLicenseCache();
          finish(true);
          return { ok: true };
        }
        return { ok: false };
      } catch {
        return { ok: false };
      }
    });

    ipcMain.handle("kont-lic-try", async (_e, payload) => {
      try {
        const key = String(payload?.key || "").trim();
        const email = String(payload?.email || "").trim().toLowerCase();
        if (!key) return { ok: false, message: "Shkruani çelësin e licencës." };
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { ok: false, message: "Shkruani email të vlefshëm." };
        }
        const cloud = require(path.join(PROTECTION_DIR, "cloud-license"));
        await cloud.activateWithKey(app, key, { email });
        syncLocalLicenseCache();
        finish(true);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err.message || String(err) };
      }
    });

    ipcMain.handle("kont-lic-close", async () => {
      finish(false);
      try { app.quit(); } catch { /* ignore */ }
      return { ok: true };
    });

    win.on("closed", () => finish(false));
  });
}

async function ensureHardwareLicense(app, opts = {}) {
  const cloud = require(path.join(PROTECTION_DIR, "cloud-license"));
  cloud.registerInstallContext(app);

  const claimed = await cloud.claimByHardwareId(app);
  if (claimed?.valid) return { ok: true };

  if (cloud.isWithinCloudOfflineWindow(app) && cloud.isLicenseActiveLocally(app)) {
    return { ok: true, offline: true };
  }

  if (!isPackagedApp(app)) {
    return { ok: true, skipped: true };
  }

  const reason = opts.reason || "no_license";
  const activated = await promptHardwareActivation(app, { reason });
  return { ok: !!activated };
}

module.exports = {
  getSecretSalt,
  getHardwareId,
  formatHardwareId,
  buildWhatsAppActivationUrl,
  ensureHardwareLicense,
  promptHardwareActivation,
  CONTACT_PHONE,
};
