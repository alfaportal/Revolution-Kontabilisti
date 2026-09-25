/** Tab i dedikuar Licenca — status + IPC nga heartbeat (main process). */
const LicencaApp = {
  async init() {
    const root = document.getElementById("module-root");
    root.innerHTML = '<div class="empty-state">Duke ngarkuar licencën…</div>';
    await this.render();
    this.bindIpc();
  },

  bindIpc() {
    if (this._ipcBound) return;
    this._ipcBound = true;
    window.kontabilisti?.onLicensePackageUpdated?.(() => {
      this.render().catch(() => {});
    });
    window.kontabilisti?.onLicenseKeyUpdated?.(() => {
      this.render().catch(() => {});
    });
  },

  esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  },

  maskKey(key) {
    const k = String(key || "").trim();
    if (!k) return "—";
    if (k.length <= 12) return k;
    return `${k.slice(0, 4)}-****-****-${k.slice(-4)}`;
  },

  async render() {
    const root = document.getElementById("module-root");
    const st = await KAPI.api("/license/status").catch(() => ({ active: false }));
    const active = !!st.active;
    const statusLabel = active ? "✅ Aktive" : "❌ Jo aktive";
    const used = st.scans_used ?? 0;
    const limit = st.scans_limit ?? 500;
    const remaining = st.scans_remaining ?? Math.max(0, limit - used);
    const keyDisplay = st.license_key_display || this.maskKey(st.license_key) || "—";

    root.innerHTML = `
      <div class="card">
        <h3>🔑 Licenca</h3>
        <p class="hint">Skanimi AI dhe aktivizimi kërkojnë internet. Kontabiliteti punon offline.</p>
        <div class="form-grid" style="max-width:520px;margin-top:16px">
          <div><strong>Statusi:</strong> ${statusLabel}${st.offline ? " (offline cache)" : ""}</div>
          <div><strong>Hardware ID:</strong> <code style="font-size:0.85rem;user-select:all">${this.esc(st.device_id || "—")}</code></div>
          <div><strong>Skadon:</strong> ${st.expires_at ? KAPI.fmtDate(st.expires_at) : "—"}</div>
          <div><strong>Skanimet:</strong> ${used} / ${limit} (${remaining} të mbetura)</div>
          <div><strong>Plan:</strong> ${this.esc(String(st.plan || "standard").replace(/^./, (c) => c.toUpperCase()))}</div>
          <div><strong>Çelësi i licencës:</strong> <code style="font-size:0.85rem">${this.esc(keyDisplay)}</code></div>
        </div>
        <div class="toolbar" style="margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-primary" id="lic-tab-refresh">Rifresko statusin</button>
          <button class="btn btn-secondary" id="lic-tab-activate">Aktivizo / riaktivizo</button>
        </div>
        <p class="hint" style="margin-top:16px">Ndryshimet nga admini (telefon) sinkronizohen automatikisht. WhatsApp: +383 48707880</p>
      </div>`;

    document.getElementById("lic-tab-refresh").onclick = async () => {
      try {
        await KAPI.api("/license/refresh", { method: "POST", body: {} });
        KAPI.toast("Statusi u rifreskua");
        await this.render();
      } catch (e) {
        KAPI.toast(e.message, true);
      }
    };
    document.getElementById("lic-tab-activate").onclick = async () => {
      if (window.LicenseActivation) {
        await LicenseActivation.show(false);
        await this.render();
      }
    };
  },
};

window.LicencaApp = LicencaApp;
