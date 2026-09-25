/** Modul: Dërgo në ATK — formular zyrtar EDI për kopjim 1:1 */
const DergoAtkApp = {
  step: 1,
  periodType: "quarterly",
  year: new Date().getFullYear(),
  period: Math.ceil((new Date().getMonth() + 1) / 3),
  data: null,
  settings: null,
  savedDeclId: null,

  MONTHS: ["Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor", "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor"],
  QLABELS: ["Q1 (Jan–Mar)", "Q2 (Apr–Qer)", "Q3 (Kor–Sht)", "Q4 (Tet–Dhj)"],

  BOXES: {
    sales: [
      { key: "9", label: "Kredit TVSH nga periudha e kaluar" },
      { key: "10a", label: "Shitje me normë 18% — Baza (pa TVSH)" },
      { key: "10b", label: "Shitje me normë 8% — Baza (pa TVSH)" },
      { key: "10c", label: "Shitje me normë 0% — Baza (pa TVSH)" },
      { key: "11", label: "TOTALI bazës së shitjeve" },
      { key: "12", label: "TVSH 18%" },
      { key: "14", label: "TVSH 8%" },
      { key: "16", label: "TVSH totale e daljes" },
    ],
    purchases: [
      { key: "31", label: "Blerje me normë 18% — Baza (pa TVSH)" },
      { key: "43", label: "TVSH e zbritshme 18%" },
      { key: "45", label: "Blerje me normë 8% — Baza (pa TVSH)" },
      { key: "47", label: "TVSH e zbritshme 8%" },
      { key: "65", label: "TVSH totale e hyrjes" },
    ],
    summary: [
      { key: "K1", label: "TVSH e daljes" },
      { key: "K2", label: "TVSH e hyrjes" },
      { key: "30", label: "TVSH PËR PAGESË / KTHIM" },
    ],
  },

  ALL_KEYS: ["9", "10a", "10b", "10c", "11", "12", "14", "16", "31", "43", "45", "47", "65", "K1", "K2", "30"],

  fmtCopy(n) {
    return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  fmtEuro(n) {
    return `€${KAPI.fmt(n)}`;
  },

  periodDisplay() {
    if (this.periodType === "monthly") return `${this.MONTHS[this.period - 1]} ${this.year}`;
    return `${this.QLABELS[this.period - 1]} ${this.year}`;
  },

  periodOptions() {
    const y = this.year;
    if (this.periodType === "monthly") {
      return this.MONTHS.map((m, i) => ({ value: i + 1, label: `${m} ${y}` }));
    }
    return this.QLABELS.map((q, i) => ({ value: i + 1, label: `${q} ${y}` }));
  },

  pdfFilename() {
    const raw = this.data?.bounds?.label || this.periodDisplay();
    const safe = String(raw).replace(/[^\w\s\u00C0-\u024F-]/gi, "").trim().replace(/\s+/g, "-") || "tvsh";
    return `deklarata-tvsh-${safe}.pdf`;
  },

  instructionsBtnHtml(cls = "btn btn-secondary btn-sm") {
    return `<button type="button" class="${cls}" id="atk-open-instructions">📖 Lexo Udhëzimet</button>`;
  },

  bindInstructionsBtn(container) {
    container?.querySelector("#atk-open-instructions")?.addEventListener("click", () => this.showInstructionsModal());
  },

  bindExportButtons(container, canExport) {
    const disable = (sel) => {
      container.querySelectorAll(sel).forEach((btn) => {
        if (!canExport) btn.setAttribute("disabled", "");
        else btn.removeAttribute("disabled");
      });
    };
    container.querySelectorAll("[data-action='print']").forEach((btn) => {
      btn.onclick = () => this.exportForm("print");
    });
    container.querySelectorAll("[data-action='pdf']").forEach((btn) => {
      btn.onclick = () => this.exportForm("pdf");
    });
    disable("[data-action='print']");
    disable("[data-action='pdf']");
  },

  buildInstructionsHtml() {
    const isQ = this.periodType === "quarterly";
    const periodHint = this.periodDisplay();
    return `
      <p class="atk-instructions-intro">
        Ky modul ju ndihmon të llogaritni <strong>Deklaratën e TVSH-së</strong>, të kontrolloni saktësinë e të dhënave
        dhe t&apos;i kopjoni kutizat zyrtare në portalin e ATK-së. Aplikacioni <strong>nuk dërgon automatikisht</strong>
        te ATK — ju futni vlerat manualisht në <a href="https://edi.atk-ks.org" target="_blank" rel="noopener">edi.atk-ks.org</a>.
      </p>

      <section class="atk-instructions-section">
        <h3>1. Çka bën ky modul</h3>
        <ol>
          <li>Mbledh shitjet (Z-Raport + fatura B2B), blerjet dhe shpenzimet e periudhës.</li>
          <li>Llogarit kutizat zyrtare ATK: [9], [10a]–[16], [31]–[65], K1, K2, [30].</li>
          <li>Kryen self-check — 10 kontrolle matematike para dërgimit.</li>
          <li>Ju lejon të kopjoni kutizat, të printoni/ruani PDF dhe të ruani historinë lokale.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>2. Si të zgjedhësh periudhën (Hapi 1)</h3>
        <ol>
          <li>Hap modulin <strong>Dërgo në ATK</strong> nga sidebar-i.</li>
          <li>Te Hapi 1, zgjidh <strong>Vitin fiskal</strong> dhe ${isQ ? "<strong>Tremujorin</strong>" : "<strong>Muajin</strong>"} e deklarimit.</li>
          <li>Periudha (mujore/tremujore) vjen nga <strong>Cilësimet</strong> — ndryshoje atje nëse biznesi deklaron ndryshe.</li>
          <li>Sigurohu që periudha përputhet me afatin ATK (paneli «Afatet e deklarimeve» sipër).</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>3. Si të gjenerosh deklaratën</h3>
        <ol>
          <li>Kliko <strong>Gjenero Deklaratën</strong>.</li>
          <li>Sistemi llogarit kutizat nga databaza lokale dhe kalon automatikisht te Hapi 2.</li>
          <li>Nëse ka gabime në fatura, shfaqet banner i kuq — rregullo të dhënat para dërgimit.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>4. Si të kontrollosh self-check</h3>
        <ol>
          <li>Poshtë formularit, shiko kartën <strong>Kontroll para dërgimit (Self-check)</strong>.</li>
          <li>Çdo rresht me ✅ do të thotë që formula ATK përputhet.</li>
          <li>❌ = gabim — kontrollo faturat e shitjes/blerjes, Z-Raportet ose shpenzimet e periudhës.</li>
          <li>Paralajmërimet 🟠 nuk ndalojnë gjithmonë, por lexoji para dërgimit.</li>
          <li>Vetëm kur banneri thotë «Deklarata është e saktë — gati për ATK» vazhdo drejt portalit.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>5. Si të kopjosh kutizat</h3>
        <ol>
          <li>Pranë çdo kutize, kliko <strong>📋 KOPJO</strong> — vlera (pa €) shkon në clipboard.</li>
          <li>Për të gjitha kutizat njëherësh: <strong>KOPJO TË GJITHA</strong>.</li>
          <li>Ngjit (Ctrl+V) në fushën përkatëse të formularit në portalin ATK.</li>
          <li>Mos ndrysho formatin e numrave — përdor vlerat siç i jep aplikacioni.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>6. Si të hapësh edi.atk-ks.org</h3>
        <ol>
          <li>Hap shfletuesin (Chrome, Edge, Firefox).</li>
          <li>Shko te <a href="https://edi.atk-ks.org" target="_blank" rel="noopener">https://edi.atk-ks.org</a>.</li>
          <li>Zgjidh <strong>Deklarata e TVSH-së</strong> nga menuja e shërbimeve.</li>
          <li>Zgjidh të njëjtën periudhë si te Hapi 1${periodHint ? ` (<strong>${periodHint}</strong>)` : ""}.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>7. Si të identifikohesh</h3>
        <ol>
          <li>Identifikohu me <strong>certifikatën elektronike</strong> (e-ID biznesi) ose <strong>kredencialet e biznesit</strong> që ke regjistruar te ATK.</li>
          <li>Certifikata duhet të jetë e vlefshme dhe e lidhur me NUI-n e biznesit.</li>
          <li>Revolution Kontabilisti nuk ruan certifikatën ATK — autentikimi bëhet vetëm në portal.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>8. Si të ngjitësh kutizat në portal</h3>
        <ol>
          <li>Hap formularin e deklaratës për periudhën e zgjedhur.</li>
          <li>Për çdo kutizë [9], [10a], … [30], ngjit vlerën e kopjuar nga Hapi 2.</li>
          <li>Krahaso edhe një herë me ekranin e Kontabilistit — numrat duhet të jenë identikë.</li>
          <li>Kontrollo mesazhin e TVSH-së ([30]): detyrim, kredit ose balancë zero.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>9. Si të dërgosh dhe si të ruash konfirmimin</h3>
        <ol>
          <li>Pas plotësimit, kliko <strong>Dërgo</strong> në portalin ATK (jo në këtë aplikacion).</li>
          <li>Ruaj konfirmimin: screenshot ose PDF që jep ATK pas dërgimit të suksesshëm.</li>
          <li>Te Hapi 4 (Histori), ndrysho statusin: <strong>Draft → Dërguar → Konfirmuar</strong>.</li>
          <li>Ruaj draft lokal me <strong>Ruaj Draft</strong> para se të dalësh nga moduli.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>10. Si të printosh / ruash PDF deklaratën</h3>
        <ol>
          <li>Te Hapi 2: <strong>🖨 Printo</strong> — hap dialogun e printimit (header + kutiza + TVSH).</li>
          <li><strong>📄 PDF</strong> — ruan skedarin <code>deklarata-tvsh-….pdf</code> (Electron).</li>
          <li>Shkurtesa <strong>Ctrl+P</strong> printon deklaratën kur je në këtë modul.</li>
          <li>Print/PDF kërkojnë self-check ✅ — nuk lejohen me gabime kritike.</li>
          <li>Te Histori, butoni <strong>📄 PDF</strong> ruan deklaratën e asaj periudhe.</li>
        </ol>
      </section>

      <section class="atk-instructions-section">
        <h3>11. Si të shohësh historinë</h3>
        <ol>
          <li>Kliko tab-in <strong>Histori</strong> (Hapi 4).</li>
          <li>Shiko periudhën, datat, statusin dhe datën e gjenerimit.</li>
          <li><strong>Shiko</strong> — hap formularin e ruajtur te Hapi 2.</li>
          <li><strong>PDF</strong> — shkarko deklaratën e asaj periudhe si skedar.</li>
          <li>Kliko badge-in e statusit për ta ndryshuar manualisht pas dërgimit te ATK.</li>
        </ol>
      </section>`;
  },

  showInstructionsModal() {
    this.closeInstructionsModal();
    const overlay = document.createElement("div");
    overlay.id = "atk-instructions-overlay";
    overlay.className = "modal-overlay atk-instructions-overlay";
    overlay.innerHTML = `
      <div class="modal atk-instructions-modal" role="dialog" aria-labelledby="atk-instructions-title">
        <div class="atk-instructions-header">
          <h2 id="atk-instructions-title">Si të përdoret moduli Dërgo në ATK</h2>
          <button type="button" class="btn btn-sm atk-instructions-close" id="atk-instructions-close" aria-label="Mbyll">✕</button>
        </div>
        <div class="atk-instructions-body">${this.buildInstructionsHtml()}</div>
        <div class="atk-instructions-actions">
          <button type="button" class="btn btn-print btn-sm" id="atk-instructions-print">🖨 Printo udhëzimet</button>
          <button type="button" class="btn btn-secondary btn-sm" id="atk-instructions-dismiss">Mbyll</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.style.display = "flex";
    const close = () => this.closeInstructionsModal();
    overlay.querySelector("#atk-instructions-close").onclick = close;
    overlay.querySelector("#atk-instructions-dismiss").onclick = close;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector("#atk-instructions-print").onclick = () => this.printInstructions();
  },

  closeInstructionsModal() {
    document.getElementById("atk-instructions-overlay")?.remove();
  },

  printInstructions() {
    const body = this.buildInstructionsHtml();
    const today = new Date().toISOString().slice(0, 10);
    if (window.PdfExport) {
      PdfExport.printHtmlSync(
        "Si të përdoret moduli Dërgo në ATK",
        body,
        this.settings,
        today,
        today
      );
    } else {
      const w = window.open("", "_blank");
      w.document.write(`<html><head><title>Udhëzime Dërgo në ATK</title></head><body>${body}</body></html>`);
      w.document.close();
      w.print();
    }
  },

  async init() {
    this.closeInstructionsModal();
    const root = document.getElementById("module-root");
    const settingsRes = await KAPI.api("/settings");
    this.settings = settingsRes.settings;
    this.periodType = this.settings.declaration_period || "quarterly";
    this.year = this.settings.fiscal_year || new Date().getFullYear();

    root.innerHTML = `
      <div class="atk-module">
        <div class="atk-steps">
          <button type="button" class="atk-step ${this.step === 1 ? "active" : ""} ${this.data ? "done" : ""}" data-s="1">
            <span class="atk-step-num">1</span> Zgjedh periudhën
          </button>
          <button type="button" class="atk-step ${this.step === 2 ? "active" : ""} ${this.data ? "done" : ""}" data-s="2">
            <span class="atk-step-num">2</span> Formulari ATK
          </button>
          <button type="button" class="atk-step ${this.step === 3 ? "active" : ""}" data-s="3">
            <span class="atk-step-num">3</span> Udhëzuesi
          </button>
          <button type="button" class="atk-step ${this.step === 4 ? "active" : ""}" data-s="4">
            <span class="atk-step-num">📋</span> Histori
          </button>
        </div>
        <div id="atk-content"></div>
      </div>`;

    root.querySelectorAll(".atk-step").forEach((t) => {
      t.onclick = () => {
        const s = Number(t.dataset.s);
        if (s === 2 && !this.data) return KAPI.toast("Gjenero deklaratën fillimisht (Hapi 1)", true);
        this.step = s;
        this.init();
      };
    });

    if (this.step === 1) await this.renderStep1();
    else if (this.step === 2) await this.renderStep2();
    else if (this.step === 3) this.renderStep3();
    else await this.renderHistory();
  },

  async renderStep1() {
    const el = document.getElementById("atk-content");
    const isQ = this.periodType === "quarterly";
    const opts = this.periodOptions().map((o) =>
      `<option value="${o.value}" ${o.value === this.period ? "selected" : ""}>${o.label}</option>`
    ).join("");

    el.innerHTML = `
      <div class="card atk-step-card">
        <h3>Hapi 1 — Zgjedh periudhën e deklarimit</h3>
        <p class="atk-hint">Periudha aktuale e biznesit: <strong>${isQ ? "Tremujore" : "Mujore"}</strong> (ndrysho te Cilësimet nëse duhet)</p>
        <div class="form-grid atk-period-grid">
          <div class="form-group">
            <label>Viti fiskal</label>
            <input type="number" id="atk-year" value="${this.year}" min="2020" max="2099">
          </div>
          <div class="form-group">
            <label>${isQ ? "Tremujori" : "Muaji"}</label>
            <select id="atk-period">${opts}</select>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-lg" id="atk-generate">Gjenero Deklaratën</button>
        <div class="atk-step1-actions">${this.instructionsBtnHtml("btn btn-secondary")}</div>
      </div>`;

    this.bindInstructionsBtn(el);

    document.getElementById("atk-year").onchange = (e) => {
      this.year = Number(e.target.value);
      this.renderStep1();
    };

    document.getElementById("atk-generate").onclick = async () => {
      this.year = Number(document.getElementById("atk-year").value);
      this.period = Number(document.getElementById("atk-period").value);
      const btn = document.getElementById("atk-generate");
      btn.disabled = true;
      btn.textContent = "Duke llogaritur…";
      try {
        this.data = await KAPI.api(`/vat/period?period_type=${this.periodType}&year=${this.year}&period=${this.period}`);
        this.savedDeclId = null;
        this.step = 2;
        await this.init();
      } catch (e) {
        KAPI.toast(e.message, true);
        btn.disabled = false;
        btn.textContent = "Gjenero Deklaratën";
      }
    };
  },

  renderBoxRow(key, label, value) {
    const copyVal = this.fmtCopy(value);
    return `<div class="atk-form-row" data-key="${key}">
      <div class="atk-form-code">[${key}]</div>
      <div class="atk-form-label">${label}</div>
      <div class="atk-form-value">${this.fmtEuro(value)}</div>
      <button type="button" class="btn btn-sm atk-copy-btn" data-copy="${copyVal}" title="Kopjo vlerën">📋 KOPJO</button>
    </div>`;
  },

  renderSection(title, rows, boxes) {
    return `
      <div class="atk-form-section">
        <div class="atk-form-section-title">${title}</div>
        ${rows.map((r) => this.renderBoxRow(r.key, r.label, boxes[r.key])).join("")}
      </div>`;
  },

  paymentMessage(boxes) {
    const k1 = boxes.K1 || 0;
    const k2 = boxes.K2 || 0;
    const b9 = boxes["9"] || 0;
    const b30 = boxes["30"] || 0;
    const formula = `(K1 − K2 − [9] = ${this.fmtCopy(k1)} − ${this.fmtCopy(k2)} − ${this.fmtCopy(b9)})`;
    if (b30 > 0) {
      return `<div class="atk-pay-msg atk-pay-due">⚠ Ju detyroheni ATK-së: <strong>${this.fmtEuro(b30)}</strong><br><span class="atk-formula">${formula}</span></div>`;
    }
    if (b30 < 0) {
      return `<div class="atk-pay-msg atk-pay-credit">✅ Keni kredit TVSH: <strong>${this.fmtEuro(Math.abs(b30))}</strong> — bartet te [9] periudhës tjetër<br><span class="atk-formula">${formula}</span></div>`;
    }
    return `<div class="atk-pay-msg atk-pay-zero">✅ TVSH e balancuar — nuk keni detyrim për këtë periudhë<br><span class="atk-formula">${formula}</span></div>`;
  },

  bindCopyButtons(container) {
    container.querySelectorAll(".atk-copy-btn").forEach((btn) => {
      btn.onclick = async () => {
        const val = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(val);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = val;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        btn.textContent = "✓ Kopjuar";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "📋 KOPJO";
          btn.classList.remove("copied");
        }, 2000);
      };
    });
  },

  buildCopyAllText() {
    const s = this.settings || {};
    const b = this.data.boxes;
    const lines = [
      "DEKLARATA E TVSH-SË",
      `Periudha: ${this.periodDisplay()}`,
      `Biznesi: ${s.business_legal_name || "—"}`,
      `NUI: ${s.nui || "—"}`,
      "",
      ...this.ALL_KEYS.map((k) => `[${k}] = ${this.fmtCopy(b[k])}`),
    ];
    return lines.join("\n");
  },

  async renderStep2() {
    const el = document.getElementById("atk-content");
    if (!this.data) {
      this.step = 1;
      return this.init();
    }

    const b = this.data.boxes;
    const check = this.data.selfCheck;
    const s = this.settings || {};
    const canExport = check.passed && this.data.audit?.ok !== false;

    el.innerHTML = `
      <div class="atk-status-banner ${check.passed ? "ok" : "err"}">
        ${check.passed
          ? "✅ Deklarata është e saktë — gati për ATK"
          : "❌ GABIM: Kontrollo faturat — disa kutiza nuk përputhen"}
      </div>

      <div class="card atk-form-card">
        <div class="atk-form-header">
          <h2>DEKLARATA E TVSH-SË</h2>
          <div class="atk-form-sub">Periudha: ${KAPI.fmtDate(this.data.bounds.start)} — ${KAPI.fmtDate(this.data.bounds.end)} (${this.periodDisplay()})</div>
          <div class="atk-form-biz">${s.business_legal_name || "—"}</div>
          <div class="atk-form-meta">NUI: ${s.nui || "—"} &nbsp;|&nbsp; ARBK: ${s.arbk || "—"} &nbsp;|&nbsp; Nr. Fiskal: ${s.fiscal_number || "—"}${s.vat_number ? ` &nbsp;|&nbsp; Nr. TVSH: ${s.vat_number}` : ""}</div>
        </div>

        ${this.renderSection("═══ PJESA A — SHITJET (TVSH E DALJES) ═══", this.BOXES.sales, b)}
        ${this.renderSection("═══ PJESA B — BLERJET (TVSH E HYRJES) ═══", this.BOXES.purchases, b)}
        ${this.renderSection("═══ PËRFUNDIMI ═══", this.BOXES.summary, b)}

        ${this.paymentMessage(b)}

        <div class="atk-form-actions">
          <button type="button" class="btn btn-secondary" id="copy-all">KOPJO TË GJITHA</button>
          ${CsvExport.toolbar({ csv: false, pdf: true })}
          ${this.instructionsBtnHtml()}
          <button type="button" class="btn btn-secondary" id="save-decl">Ruaj Draft</button>
        </div>
      </div>

      <div class="card atk-check-card">
        <h3>Kontroll para dërgimit (Self-check)</h3>
        <div class="atk-check-list">
          ${check.checks.map((c) => `
            <div class="atk-check-item ${c.ok ? "ok" : "fail"}">
              <span class="atk-check-icon">${c.ok ? "✅" : "❌"}</span>
              <span>${c.label}</span>
            </div>`).join("")}
        </div>
        ${this.data.audit?.warnings?.length ? `
          <div class="atk-warnings">
            <h4>Paralajmërime</h4>
            ${this.data.audit.warnings.map((w) => `<p class="warn">🟠 ${w}</p>`).join("")}
          </div>` : ""}
      </div>

      <div class="card atk-guide-inline">
        <h3>Udhëzues i shpejtë — 7 hapa</h3>
        <ol>
          <li>Hyni në <a href="https://edi.atk-ks.org" target="_blank" rel="noopener">https://edi.atk-ks.org</a></li>
          <li>Zgjidhni &quot;Deklarata e TVSH-së&quot;</li>
          <li>Zgjidhni periudhën <strong>${this.periodDisplay()}</strong> (duhet të njëjta me këtu)</li>
          <li>Kopjoni çdo kutizë duke klikuar 📋 KOPJO dhe ngjitni në ATK</li>
          <li>Kontrolloni edhe një herë numrat</li>
          <li>Klikoni &quot;Dërgo&quot; në portalin ATK</li>
          <li>Ruani konfirmimin (screenshot ose PDF)</li>
        </ol>
      </div>`;

    this.bindCopyButtons(el);

    document.getElementById("copy-all").onclick = async () => {
      const text = this.buildCopyAllText();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      const btn = document.getElementById("copy-all");
      btn.textContent = "✓ Të gjitha u kopjuan";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "KOPJO TË GJITHA";
        btn.classList.remove("copied");
      }, 2000);
    };

    this.bindExportButtons(el, canExport);
    this.bindInstructionsBtn(el);

    window.printContext = {
      print: () => this.exportForm("print"),
      pdf: () => this.exportForm("pdf"),
    };

    document.getElementById("save-decl").onclick = () => this.saveDeclaration("draft");
  },

  async saveDeclaration(status) {
    const res = await KAPI.api("/vat-declarations", {
      method: "POST",
      body: {
        period_type: this.periodType,
        period_label: this.periodDisplay(),
        period_start: this.data.bounds.start,
        period_end: this.data.bounds.end,
        status,
        data: this.data.boxes,
      },
    });
    this.savedDeclId = res.id;
    KAPI.toast(status === "draft" ? "Deklarata u ruajt si draft" : "Deklarata u ruajt");
    KAPI.emitDataChanged();
  },

  exportForm(mode) {
    const check = this.data.selfCheck;
    if (!check.passed) return KAPI.toast("Self-check duhet të kalojë — ka gabime kritike", true);
    if (this.data.audit?.errors?.length) {
      return KAPI.toast("Gabime: " + this.data.audit.errors.join("; "), true);
    }
    if (this.data.audit?.warnings?.length) {
      if (!confirm("Paralajmërime:\n" + this.data.audit.warnings.join("\n") + "\n\nVazhdo?")) return;
    }

    const b = this.data.boxes;
    const allRows = [...this.BOXES.sales, ...this.BOXES.purchases, ...this.BOXES.summary];
    const tableRows = allRows.map((r) =>
      `<tr><td>[${r.key}]</td><td>${r.label}</td><td style="text-align:right;font-weight:700">${this.fmtCopy(b[r.key])}</td></tr>`
    ).join("");

    const body = `
      ${this.paymentMessage(b).replace(/class="atk-pay-msg[^"]*"/g, 'class="atk-pay-msg"')}
      <table><thead><tr><th>Kutiza</th><th>Përshkrimi</th><th>Vlera (€)</th></tr></thead>
      <tbody>${tableRows}</tbody></table>`;

    if (window.PdfExport) {
      const title = "DEKLARATA E TVSH-SË";
      if (mode === "pdf") {
        PdfExport.exportPdfSync(title, body, this.settings, this.data.bounds.start, this.data.bounds.end, this.pdfFilename());
      } else {
        PdfExport.printHtmlSync(title, body, this.settings, this.data.bounds.start, this.data.bounds.end);
      }
    } else {
      window.print();
    }
  },

  renderStep3() {
    document.getElementById("atk-content").innerHTML = `
      <div class="card atk-guide-card">
        <h3>Hapi 3 — Udhëzues hap-pas-hapi drejt portalit ATK</h3>
        <ol class="atk-guide-steps">
          <li><strong>Hyni</strong> në <a href="https://edi.atk-ks.org" target="_blank" rel="noopener">https://edi.atk-ks.org</a></li>
          <li><strong>Identifikohuni</strong> me certifikatën elektronike ose kredencialet e biznesit</li>
          <li><strong>Zgjidhni</strong> &quot;Deklarata e TVSH-së&quot; nga menuja</li>
          <li><strong>Zgjidhni periudhën</strong> — duhet të jetë e njëjta me atë në Hapi 1 (${this.periodDisplay()})</li>
          <li><strong>Kopjoni kutizat</strong> — kthehuni te Hapi 2, klikoni 📋 KOPJO pranë çdo kutize dhe ngjitni në fushën përkatëse në ATK</li>
          <li><strong>Kontrolloni</strong> — verifikoni që self-check tregon ✅ për të gjitha kontrollet</li>
          <li><strong>Dërgoni</strong> deklaratën në ATK dhe ruani konfirmimin (screenshot ose PDF)</li>
        </ol>
        <p class="atk-hint">💡 Përdorni butonin &quot;KOPJO TË GJITHA&quot; për të kopjuar krejt kutizat në një herë — praktike për email ose Word.</p>
        <div class="atk-step3-actions">
          ${this.instructionsBtnHtml("btn btn-secondary")}
          ${this.data ? `<button type="button" class="btn btn-primary" id="go-form">Shko te Formulari ATK</button>` : ""}
        </div>
      </div>`;
    this.bindInstructionsBtn(document.getElementById("atk-content"));
    const go = document.getElementById("go-form");
    if (go) go.onclick = () => { this.step = 2; this.init(); };
  },

  statusBadge(status) {
    const map = {
      draft: { icon: "📝", label: "Draft", cls: "draft" },
      sent: { icon: "📤", label: "Dërguar", cls: "sent" },
      confirmed: { icon: "✅", label: "Konfirmuar", cls: "confirmed" },
    };
    const m = map[status] || map.draft;
    return `<span class="atk-status-badge ${m.cls}" data-status="${status}">${m.icon} ${m.label}</span>`;
  },

  nextStatus(current) {
    const cycle = ["draft", "sent", "confirmed"];
    const i = cycle.indexOf(current);
    return cycle[(i + 1) % cycle.length];
  },

  async renderHistory() {
    const data = await KAPI.api("/vat-declarations");
    const el = document.getElementById("atk-content");
    el.innerHTML = `
      <div class="card">
        <h3>Histori e deklaratave TVSH</h3>
        <table class="data-table atk-history-table">
          <thead><tr>
            <th>Periudha</th><th>Fillimi</th><th>Fundi</th><th>Statusi</th><th>Gjeneruar</th><th>Veprime</th>
          </tr></thead>
          <tbody>${data.rows.length ? data.rows.map((r) => {
            let boxes = {};
            try { boxes = JSON.parse(r.data_json || "{}"); } catch { /* ignore */ }
            return `<tr data-id="${r.id}">
              <td>${r.period_label}</td>
              <td>${KAPI.fmtDate(r.period_start)}</td>
              <td>${KAPI.fmtDate(r.period_end)}</td>
              <td><button type="button" class="btn btn-sm atk-status-toggle" data-id="${r.id}" data-status="${r.status}">${this.statusBadge(r.status)}</button></td>
              <td>${KAPI.fmtDate(r.created_at?.slice(0, 10))}</td>
              <td class="atk-history-actions">
                <button type="button" class="btn btn-sm btn-secondary hist-view" data-id="${r.id}">Shiko</button>
                <button type="button" class="btn btn-sm btn-print hist-print" data-id="${r.id}">🖨</button>
                <button type="button" class="btn btn-sm btn-primary hist-pdf" data-id="${r.id}">📄 PDF</button>
              </td>
            </tr>`;
          }).join("") : '<tr><td colspan="6" class="empty-state">Ende pa deklarata — gjenero një te Hapi 1</td></tr>'}
          </tbody>
        </table>
        <p class="atk-hint">Kliko statusin për të ndryshuar: Draft → Dërguar → Konfirmuar</p>
        <div class="atk-history-footer">${this.instructionsBtnHtml()}</div>
      </div>`;

    el.querySelectorAll(".atk-status-toggle").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const next = this.nextStatus(btn.dataset.status);
        await KAPI.api(`/vat-declarations/${id}`, { method: "PATCH", body: { status: next } });
        KAPI.toast(`Statusi: ${next}`);
        await this.renderHistory();
      };
    });

    el.querySelectorAll(".hist-view").forEach((btn) => {
      btn.onclick = () => {
        const row = data.rows.find((r) => String(r.id) === btn.dataset.id);
        if (!row) return;
        this.loadHistoryRow(row);
        this.step = 2;
        this.init();
      };
    });

    el.querySelectorAll(".hist-pdf").forEach((btn) => {
      btn.onclick = () => {
        const row = data.rows.find((r) => String(r.id) === btn.dataset.id);
        if (!row) return;
        this.loadHistoryRow(row);
        this.exportForm("pdf");
      };
    });

    el.querySelectorAll(".hist-print").forEach((btn) => {
      btn.onclick = () => {
        const row = data.rows.find((r) => String(r.id) === btn.dataset.id);
        if (!row) return;
        this.loadHistoryRow(row);
        this.exportForm("print");
      };
    });

    this.bindInstructionsBtn(el);
  },

  loadHistoryRow(row) {
    let boxes = {};
    try { boxes = JSON.parse(row.data_json || "{}"); } catch { /* ignore */ }
    this.data = {
      bounds: { start: row.period_start, end: row.period_end, label: row.period_label },
      boxes,
      selfCheck: { passed: true, checks: [] },
      audit: { ok: true, warnings: [], errors: [] },
    };
    if (row.period_type) this.periodType = row.period_type;
  },
};
