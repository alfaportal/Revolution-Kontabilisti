const CilesimetApp = {
  section: "biznes",
  async init() {
    const root = document.getElementById("module-root");
    root.innerHTML = `
      <div class="tabs">
        <button class="tab ${this.section === "biznes" ? "active" : ""}" data-s="biznes">Të dhënat e biznesit</button>
        <button class="tab ${this.section === "njoftimet" ? "active" : ""}" data-s="njoftimet">Njoftimet</button>
        <button class="tab ${this.section === "backup" ? "active" : ""}" data-s="backup">Të dhënat</button>
        <button class="tab ${this.section === "ndihme" ? "active" : ""}" data-s="ndihme">Ndihmë</button>
      </div>
      <div id="set-content"></div>`;
    root.querySelectorAll(".tab").forEach((t) => t.onclick = () => { this.section = t.dataset.s; this.init(); });

    if (this.section === "biznes") await this.renderBiznes();
    else if (this.section === "njoftimet") this.renderNjoftimet();
    else if (this.section === "backup") await this.renderBackup();
    else this.renderNdihme();
  },

  field(id, label, value, opts = {}) {
    const BS = window.BizSettings;
    const req = opts.required ? " *" : "";
    const type = opts.type || "text";
    const extra = opts.extra || "";
    if (opts.type === "select-muni") {
      return `<div class="form-group"><label>${label}${req}</label>
        <select id="${id}"><option value="">— Zgjedh —</option>${BS.municipalityOptions(value)}</select></div>`;
    }
    if (opts.type === "select-type") {
      return `<div class="form-group"><label>${label}${req}</label>
        <select id="${id}">${BS.businessTypeOptions(value || "SH.P.K.")}</select></div>`;
    }
    return `<div class="form-group ${opts.full ? "full-width" : ""}"><label>${label}${req}</label>
      <input id="${id}" type="${type}" value="${BS.esc(value)}" ${extra}></div>`;
  },

  async renderBiznes() {
    const { settings } = await KAPI.api("/settings");
    const s = settings || {};
    const BS = window.BizSettings;
    const el = document.getElementById("set-content");
    el.innerHTML = `
      <div class="card">
        <h3>Të dhënat e biznesit</h3>
        <p class="hint">Ndryshimet reflektohen automatikisht në deklaratat dhe PDF-të e reja.</p>
        <div id="set-errors" class="wizard-errors" style="display:none"></div>

        <p class="wizard-section-title">Seksioni 1 — Të dhënat ligjore</p>
        <div class="toolbar" style="margin-bottom:12px">
          <button type="button" class="btn btn-ai-scan" id="set-scan-cert">📷 Skano Certifikatën ARBK</button>
        </div>
        <div class="form-grid">
          ${this.field("s_legal", "Emri ligjor i biznesit", s.business_legal_name, { required: true })}
          ${this.field("s_trade", "Emri tregtar", s.business_trade_name, { required: true })}
          ${this.field("s_type", "Forma ligjore", s.business_type, { type: "select-type", required: true })}
          ${this.field("s_nui", "NUI (9 shifra)", s.nui, { required: true, extra: 'maxlength="9" inputmode="numeric"' })}
          ${this.field("s_fiscal", "Nr. Fiskal", s.fiscal_number, { required: true })}
          ${this.field("s_arbk", "ARBK", s.arbk, { required: true })}
          ${this.field("s_vat", "Nr. i TVSH-së", s.vat_number)}
          ${this.field("s_regdate", "Data e regjistrimit", s.registration_date, { type: "date", required: true })}
        </div>

        <p class="wizard-section-title">Seksioni 2 — Adresa</p>
        <div class="form-grid">
          ${this.field("s_address", "Adresa", s.address, { required: true, full: true })}
          ${this.field("s_city", "Qyteti", s.city, { required: true })}
          ${this.field("s_municipality", "Komuna", s.municipality, { type: "select-muni", required: true })}
          <div class="form-group"><label>Shteti</label><input value="Kosovë" disabled></div>
          ${this.field("s_postal", "Kodi postar", s.postal_code)}
        </div>

        <p class="wizard-section-title">Seksioni 3 — Kontakti</p>
        <div class="form-grid">
          ${this.field("s_phone", "Telefoni", s.phone, { required: true })}
          ${this.field("s_email", "Email", s.email, { type: "email", required: true })}
          ${this.field("s_website", "Ueb faqja", s.website)}
        </div>

        <p class="wizard-section-title">Seksioni 4 — Pronari / Përfaqësuesi</p>
        <div class="form-grid">
          ${this.field("s_owner", "Emri i pronarit", s.owner_name, { required: true })}
          ${this.field("s_owner_id", "Nr. personal", s.owner_id_number, { required: true, extra: 'maxlength="10" inputmode="numeric"' })}
          ${this.field("s_owner_phone", "Telefoni i pronarit", s.owner_phone, { required: true })}
        </div>

        <p class="wizard-section-title">Seksioni 5 — Kontabilisti (opsional)</p>
        <div class="form-grid">
          ${this.field("s_acc", "Emri i kontabilistit", s.accountant_name)}
          ${this.field("s_acc_lic", "Nr. i licencës", s.accountant_license)}
          ${this.field("s_acc_phone", "Telefoni", s.accountant_phone)}
          ${this.field("s_acc_email", "Email", s.accountant_email, { type: "email" })}
        </div>

        <p class="wizard-section-title">Seksioni 6 — Periudha e deklarimit</p>
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Tipi i deklarimit TVSH *</label>
            <div class="radio-group">
              <label><input type="radio" name="s_period" value="monthly" ${s.declaration_period === "monthly" ? "checked" : ""}> Mujor</label>
              <label><input type="radio" name="s_period" value="quarterly" ${s.declaration_period !== "monthly" ? "checked" : ""}> Tremujor</label>
            </div>
          </div>
          ${this.field("s_year", "Viti fiskal", s.fiscal_year || new Date().getFullYear(), { type: "number", required: true })}
        </div>

        <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="save-settings">Ruaj ndryshimet</button>
          <button class="btn btn-secondary" id="open-wizard">Hap wizardin e regjistrimit</button>
        </div>
      </div>`;

    document.getElementById("save-settings").onclick = async () => {
      const g = (id) => document.getElementById(id)?.value?.trim() || "";
      const body = {
        business_legal_name: g("s_legal"),
        business_trade_name: g("s_trade"),
        business_type: g("s_type"),
        nui: g("s_nui").replace(/\D/g, ""),
        fiscal_number: g("s_fiscal"),
        arbk: g("s_arbk"),
        vat_number: g("s_vat"),
        registration_date: g("s_regdate"),
        address: g("s_address"),
        city: g("s_city"),
        municipality: g("s_municipality"),
        postal_code: g("s_postal"),
        country: "Kosovë",
        phone: g("s_phone"),
        email: g("s_email"),
        website: g("s_website"),
        owner_name: g("s_owner"),
        owner_id_number: g("s_owner_id").replace(/\D/g, ""),
        owner_phone: g("s_owner_phone"),
        accountant_name: g("s_acc"),
        accountant_license: g("s_acc_lic"),
        accountant_phone: g("s_acc_phone"),
        accountant_email: g("s_acc_email"),
        declaration_period: document.querySelector('input[name="s_period"]:checked')?.value || "quarterly",
        fiscal_year: Number(g("s_year")) || new Date().getFullYear(),
      };

      const errors = BS.validate(body);
      const errEl = document.getElementById("set-errors");
      if (errors.length) {
        errEl.style.display = "block";
        errEl.innerHTML = errors.map((e) => `<p>❌ ${e}</p>`).join("");
        KAPI.toast(errors[0], true);
        return;
      }
      errEl.style.display = "none";

      await KAPI.api("/settings", { method: "PUT", body });
      KAPI.toast("Të dhënat e biznesit u ruajtën");
      KAPI.emitDataChanged();
      await this.renderBiznes();
    };

    document.getElementById("open-wizard").onclick = async () => {
      const { settings: cur } = await KAPI.api("/settings");
      BizWizard.show(false, cur);
    };

    document.getElementById("set-scan-cert")?.addEventListener("click", () => this.openBusinessCertScan("settings"));
  },

  fillBusinessCertForm(mapped, prefix) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== "") el.value = v; };
    set(`${prefix}legal`, mapped.business_legal_name);
    set(`${prefix}trade`, mapped.business_trade_name);
    if (mapped.business_type) set(`${prefix}type`, mapped.business_type);
    set(`${prefix}nui`, mapped.nui);
    set(`${prefix}fiscal`, mapped.fiscal_number);
    set(`${prefix}arbk`, mapped.arbk);
    set(`${prefix}vat`, mapped.vat_number);
    set(`${prefix}regdate`, mapped.registration_date);
    set(`${prefix}address`, mapped.address);
    set(`${prefix}city`, mapped.city);
    if (mapped.municipality) set(`${prefix}municipality`, mapped.municipality);
    set(`${prefix}phone`, mapped.phone);
    set(`${prefix}email`, mapped.email);
  },

  openBusinessCertScan(context) {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({
      scanType: "business_cert",
      onFillForm: (mapped) => {
        if (context === "settings") {
          this.fillBusinessCertForm(mapped, "s_");
        }
      },
    });
  },

  renderNjoftimet() {
    KAPI.api("/settings").then(({ settings: s }) => {
      const el = document.getElementById("set-content");
      el.innerHTML = `
        <div class="card">
          <h3>Njoftimet e afateve ATK</h3>
          <p class="hint">Konfiguro kur dhe si shfaqen alarmet për deklaratat (TVSH, tatimi vjetor, parapagimi).</p>
          <div class="form-grid">
            <div class="form-group full-width">
              <label><input type="checkbox" id="n_startup" ${s.notify_on_startup !== 0 ? "checked" : ""}> Shfaq njoftim kur hapet programi</label>
            </div>
            <div class="form-group">
              <label>Ditë para afatit — Kujtesë 🟢</label>
              <input type="number" id="n_remind" min="1" max="60" value="${s.notify_days_reminder ?? 10}">
            </div>
            <div class="form-group">
              <label>Ditë para afatit — Paralajmërim 🟡</label>
              <input type="number" id="n_warn" min="1" max="30" value="${s.notify_days_warning ?? 5}">
            </div>
            <div class="form-group">
              <label>Ditë para afatit — Urgjencë 🔴</label>
              <input type="number" id="n_urgent" min="0" max="10" value="${s.notify_days_urgent ?? 2}">
            </div>
            <div class="form-group full-width">
              <label><input type="checkbox" id="n_banner" ${s.notify_banner !== 0 ? "checked" : ""}> Shfaq banner në Pasqyrë dhe lart</label>
            </div>
            <div class="form-group full-width">
              <label><input type="checkbox" id="n_badge" ${s.notify_badge !== 0 ? "checked" : ""}> Shfaq badge në sidebar (Dërgo në ATK)</label>
            </div>
          </div>
          <button class="btn btn-primary" id="save-notify">Ruaj njoftimet</button>
        </div>`;

      document.getElementById("save-notify").onclick = async () => {
        await KAPI.api("/settings", { method: "PUT", body: {
          notify_on_startup: document.getElementById("n_startup").checked ? 1 : 0,
          notify_days_reminder: Number(document.getElementById("n_remind").value) || 10,
          notify_days_warning: Number(document.getElementById("n_warn").value) || 5,
          notify_days_urgent: Number(document.getElementById("n_urgent").value) || 2,
          notify_banner: document.getElementById("n_banner").checked ? 1 : 0,
          notify_badge: document.getElementById("n_badge").checked ? 1 : 0,
        }});
        KAPI.toast("Njoftimet u ruajtën");
        KAPI.emitDataChanged();
      };
    });
  },

  async renderLicenca() {
    const st = await KAPI.api("/license/status").catch(() => ({ active: false }));
    const active = !!st.active;
    const statusLabel = active ? "✅ Aktive" : "❌ Jo aktive";
    const used = st.scans_used ?? 0;
    const limit = st.scans_limit ?? 500;
    const remaining = st.scans_remaining ?? Math.max(0, limit - used);

    document.getElementById("set-content").innerHTML = `
      <div class="card">
        <h3>🔑 Licenca</h3>
        <p class="hint">Kontabiliteti punon offline. Vetëm skanimi AI dhe aktivizimi kërkojnë internet.</p>
        <div class="ai-arch-diagram">
          <div>📊 SQLite lokale — pa internet</div>
          <div>📷 Skanimi AI → Serveri Revolution → Anthropic</div>
        </div>
        <div class="form-grid" style="max-width:480px;margin-top:16px">
          <div><strong>Statusi:</strong> ${statusLabel}${st.offline ? " (offline cache)" : ""}</div>
          <div><strong>Skadon:</strong> ${st.expires_at ? KAPI.fmtDate(st.expires_at) : "—"}</div>
          <div><strong>Skanimet:</strong> ${used} / ${limit} (${remaining} të mbetura)</div>
          <div><strong>Plan:</strong> ${(st.plan || "standard").replace(/^./, (c) => c.toUpperCase())}</div>
          <div><strong>ID pajisje:</strong> <code style="font-size:0.8rem">${st.device_id || "—"}</code></div>
        </div>
        <div class="toolbar" style="margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-primary" id="lic-refresh">Rifresko statusin</button>
          <button class="btn btn-secondary" id="lic-reactivate">Aktivizo licencën</button>
        </div>
        <p class="hint" style="margin-top:16px">Kontakto: revolutioninvest05@gmail.com</p>
      </div>`;

    document.getElementById("lic-refresh").onclick = async () => {
      try {
        await KAPI.api("/license/refresh", { method: "POST", body: {} });
        KAPI.toast("Statusi u rifreskua");
        await this.renderLicenca();
      } catch (e) {
        KAPI.toast(e.message, true);
      }
    };
    document.getElementById("lic-reactivate").onclick = () => {
      LicenseActivation.show(false);
    };
  },

  async renderBackup() {
    const [list, info] = await Promise.all([
      KAPI.api("/backup/list"),
      KAPI.api("/data/info"),
    ]);
    const fmtSize = (b) => {
      const mb = (Number(b) || 0) / (1024 * 1024);
      return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(mb * 1024)} KB`;
    };
    const lastBk = info.last_backup
      ? KAPI.fmtDate(info.last_backup.slice(0, 10)) + ", " + (info.last_backup.slice(11, 16) || "").replace(":", ":")
      : "—";
    const backupLoc = info.backup_dir_display || info.data_dir_display || "";
    const dbPathDisplay = info.db_path_display || info.db_path || "—";

    document.getElementById("set-content").innerHTML = `
      <div class="card">
        <h3>💾 Backup</h3>
        <div class="form-grid" style="margin-top:12px">
          <div><strong>Backup i fundit:</strong><br>${lastBk}</div>
          <div><strong>Backups totale:</strong><br>${info.backup_count_daily ?? 0}</div>
          <div><strong>Hapësira:</strong><br>${fmtSize(info.backup_size_bytes)}</div>
          <div class="full-width"><strong>Lokacioni:</strong><br><code style="font-size:0.78rem;word-break:break-all">${backupLoc || "%APPDATA%\\Kontabilisti\\"}</code></div>
        </div>
        <ul class="hint" style="margin:12px 0;padding-left:20px">
          <li>✅ Backup automatik kur hapet programi (çdo 24 orë)</li>
          <li>✅ Backup kur mbyllet programi (nëse ka ndryshime)</li>
          <li>Mbaj backups: <strong>30</strong> ditë (mujor: 5 vjet në <code>monthly/</code>)</li>
        </ul>
        <div class="toolbar" style="margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-primary" id="do-backup">💾 Bëj Backup Tani</button>
          <button class="btn btn-secondary" id="open-backup-dir">📂 Hap Folderin e Backup</button>
          <button class="btn btn-secondary" id="export-zip">📤 Eksporto krejt si ZIP</button>
          <button class="btn btn-secondary" id="restore-backup">📥 Rikthe nga Backup</button>
        </div>
        <p class="hint" style="margin-top:12px">Databaza: <code style="font-size:0.75rem">${dbPathDisplay}</code> · ${fmtSize(info.db_size_bytes)}</p>
      </div>
      <div class="card"><h3>Backup-et e fundit</h3>
        <table class="data-table"><thead><tr><th>Skedari</th><th>Data</th><th>Lloji</th></tr></thead>
        <tbody>${list.rows.slice(0, 20).map((r) => `<tr><td>${r.name}</td><td>${KAPI.fmtDate(r.mtime.slice(0, 10))} ${r.mtime.slice(11, 16)}</td><td>${r.type || "auto"}</td></tr>`).join("") || '<tr><td colspan="3">Pa backup</td></tr>'}</tbody></table>
      </div>
      <div id="restore-modal" class="modal-overlay" style="display:none">
        <div class="modal" style="max-width:480px">
          <h2>⚠️ KUJDES</h2>
          <p style="margin:12px 0;color:var(--text-secondary)">Kjo do të zëvendësojë <strong>KREJT</strong> të dhënat aktuale me backup-in e zgjedhur. Të dhënat aktuale do të humbasin.</p>
          <p><strong>Backup i zgjedhur:</strong> <span id="restore-file-name"></span><br>
          <strong>Data:</strong> <span id="restore-file-date"></span></p>
          <p class="hint">Para rikthimit, bëhet backup automatik i të dhënave aktuale.</p>
          <div class="form-group"><label>Shkruani <strong>RIKTHE</strong> për të vazhduar:</label>
            <input type="text" id="restore-confirm-input" autocomplete="off"></div>
          <div class="toolbar" style="justify-content:flex-end">
            <button type="button" class="btn btn-secondary" id="restore-cancel">Anulo</button>
            <button type="button" class="btn btn-danger" id="restore-proceed">Rikthe</button>
          </div>
        </div>
      </div>
      ${this.adminZoneHtml()}
      <div id="factory-reset-step1" class="modal-overlay" style="display:none">
        <div class="modal" style="max-width:520px">
          <h2>⚠️ KUJDES!</h2>
          <p style="margin:14px 0;line-height:1.5;color:var(--text-secondary)">
            Kjo fshin <strong>TË GJITHA</strong> të dhënat e këtij biznesi përgjithmonë.
            Vetëm administratori (Naseri) duhet ta bëjë këtë.<br><br>
            Backup-et mbeten si arkiv — por të dhënat aktive humbasin krejt.
          </p>
          <p style="margin-bottom:16px">A jeni i sigurt?</p>
          <div class="toolbar" style="justify-content:flex-end">
            <button type="button" class="btn btn-secondary" id="fr-step1-cancel">Anulo</button>
            <button type="button" class="btn btn-danger" id="fr-step1-continue">Po, vazhdo</button>
          </div>
        </div>
      </div>
      <div id="factory-reset-step2" class="modal-overlay" style="display:none">
        <div class="modal" style="max-width:520px">
          <h2>⚠️ Rivendos nga Fillimi</h2>
          <p class="hint" style="margin-bottom:14px">Shkruani <strong>RIVENDOS</strong> dhe fjalëkalimin e administratorit.</p>
          <div class="form-group"><label>Konfirmimi *</label>
            <input type="text" id="fr-confirm-word" placeholder="RIVENDOS" autocomplete="off"></div>
          <div class="form-group"><label>Fjalëkalimi i administratorit *</label>
            <input type="password" id="fr-password" autocomplete="off"></div>
          <p id="fr-error" class="wizard-errors" style="display:none;margin-top:8px"></p>
          <div class="toolbar" style="justify-content:flex-end;margin-top:16px">
            <button type="button" class="btn btn-secondary" id="fr-step2-cancel">Anulo</button>
            <button type="button" class="btn btn-danger" id="fr-step2-execute">🔴 Rivendos nga Fillimi</button>
          </div>
        </div>
      </div>`;

    let pendingRestoreFile = null;

    document.getElementById("do-backup").onclick = async () => {
      const r = window.kontabilisti ? await window.kontabilisti.backupNow() : await KAPI.api("/backup", { method: "POST" });
      KAPI.toast(r.ok ? (r.message || ("✅ Backup u krye: " + (r.name || ""))) : r.error, !r.ok);
      await this.renderBackup();
    };
    document.getElementById("open-backup-dir").onclick = async () => {
      if (window.kontabilisti?.openBackupFolder) await window.kontabilisti.openBackupFolder();
      else KAPI.toast("Vetëm në aplikacionin desktop", true);
    };
    document.getElementById("export-zip").onclick = async () => {
      if (!window.kontabilisti?.exportDataZip) return KAPI.toast("Vetëm në aplikacionin desktop", true);
      const r = await window.kontabilisti.exportDataZip();
      if (r.cancelled) return;
      KAPI.toast(r.ok ? `ZIP u ruajt: ${r.path}` : r.error, !r.ok);
    };
    document.getElementById("restore-backup").onclick = async () => {
      if (!window.kontabilisti?.restoreBackup) return KAPI.toast("Vetëm në aplikacionin desktop", true);
      const r = await window.kontabilisti.restoreBackup();
      if (r.cancelled) return;
      if (!r.ok) return KAPI.toast(r.error || "Gabim", true);
      pendingRestoreFile = r.file;
      document.getElementById("restore-file-name").textContent = r.fileName || r.file;
      document.getElementById("restore-file-date").textContent = r.fileDate || "—";
      document.getElementById("restore-confirm-input").value = "";
      document.getElementById("restore-modal").style.display = "flex";
    };
    document.getElementById("restore-cancel").onclick = () => {
      pendingRestoreFile = null;
      document.getElementById("restore-modal").style.display = "none";
    };
    document.getElementById("restore-proceed").onclick = async () => {
      if (document.getElementById("restore-confirm-input").value.trim() !== "RIKTHE") {
        return KAPI.toast('Shkruani "RIKTHE" për të vazhduar', true);
      }
      if (!pendingRestoreFile) return;
      const r = await window.kontabilisti.restoreBackupConfirmed(pendingRestoreFile);
      if (!r.ok) return KAPI.toast(r.error, true);
      KAPI.toast("Backup u rikthye — programi rifreskohet");
      location.reload();
    };

    this.bindFactoryReset();
  },

  adminZoneHtml() {
    return `
      <div class="admin-zone card">
        <h3>⚠️ ZONA E ADMINISTRATORIT</h3>
        <p class="admin-zone-title">Rivendos nga Fillimi</p>
        <p class="admin-zone-desc">Fshin <strong>TË GJITHA</strong> të dhënat dhe fillon nga zero.<br>
        Vetëm për instalim te biznes i ri.<br>
        Kërkon fjalëkalimin e administratorit.</p>
        <button type="button" class="btn btn-danger admin-reset-btn" id="factory-reset-btn">⚠️ Rivendos nga Fillimi</button>
      </div>`;
  },

  bindFactoryReset() {
    const step1 = document.getElementById("factory-reset-step1");
    const step2 = document.getElementById("factory-reset-step2");
    const errEl = document.getElementById("fr-error");
    if (!step1 || !step2) return;

    const closeAll = () => {
      step1.style.display = "none";
      step2.style.display = "none";
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
    };

    document.getElementById("factory-reset-btn")?.addEventListener("click", () => {
      closeAll();
      step1.style.display = "flex";
    });
    document.getElementById("fr-step1-cancel")?.addEventListener("click", closeAll);
    step1.addEventListener("click", (e) => { if (e.target === step1) closeAll(); });
    document.getElementById("fr-step1-continue")?.addEventListener("click", () => {
      step1.style.display = "none";
      document.getElementById("fr-confirm-word").value = "";
      document.getElementById("fr-password").value = "";
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
      step2.style.display = "flex";
      document.getElementById("fr-confirm-word")?.focus();
    });

    document.getElementById("fr-step2-cancel")?.addEventListener("click", closeAll);
    step2.addEventListener("click", (e) => { if (e.target === step2) closeAll(); });

    const runReset = async () => {
      const confirmWord = document.getElementById("fr-confirm-word")?.value?.trim() || "";
      const password = document.getElementById("fr-password")?.value || "";
      if (confirmWord !== "RIVENDOS") {
        if (errEl) {
          errEl.textContent = "Shkruani saktësisht RIVENDOS (me shkronja të mëdha).";
          errEl.style.display = "block";
        }
        return;
      }
      try {
        if (window.kontabilisti?.factoryReset) {
          const r = await window.kontabilisti.factoryReset({ confirmWord, password });
          if (!r.ok) {
            if (errEl) {
              errEl.textContent = r.error || "Fjalëkalimi nuk është i saktë. Kontaktoni administratorin.";
              errEl.style.display = "block";
            }
            return;
          }
          return;
        }
        const r = await KAPI.api("/admin/factory-reset", {
          method: "POST",
          body: { confirmWord, password },
        });
        if (r.restart) {
          KAPI.toast("Të dhënat u fshinë — programi rifreskohet");
          location.reload();
        }
      } catch (e) {
        if (errEl) {
          errEl.textContent = e.message || "Fjalëkalimi nuk është i saktë. Kontaktoni administratorin.";
          errEl.style.display = "block";
        }
      }
    };

    document.getElementById("fr-step2-execute")?.addEventListener("click", runReset);
    document.getElementById("fr-password")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runReset();
    });
  },

  renderNdihme() {
    document.getElementById("set-content").innerHTML = `
      <div class="card"><h3>Ndihmë nga Largësia</h3>
        <p style="margin:12px 0">Për mbështetje teknike, kontaktoni Revolution Invest:</p>
        <p>📧 support@revolutioninvest.com</p>
        <a class="btn btn-primary" href="https://anydesk.com/en/downloads/windows" target="_blank">Shkarko AnyDesk</a>
      </div>`;
  },
};
