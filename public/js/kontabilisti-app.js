const KontabilistiApp = {
  state: {
    period: "muaj",
    dateFrom: "",
    dateTo: "",
    applied: null,
    sec: null,
    data: null,
    priorTax: "0",
    yearAnnual: String(new Date().getFullYear()),
    rentRows: [],
  },

  PERIODS: [
    { id: "sot", label: "Sot" },
    { id: "java", label: "Kjo javë" },
    { id: "muaj", label: "Ky muaj" },
    { id: "tremujor", label: "Ky tremujor" },
    { id: "vit", label: "Ky vit" },
    { id: "lire", label: "E lirë" },
  ],

  HUB: [
    { id: "bilanc", ico: "Σ", title: "Bilanci", desc: "Shitje − blerje − shpenzime" },
    { id: "shitje-tvsh", ico: "S", title: "Libri i Shitjes TVSH", desc: "Sipas deklaratës ATK" },
    { id: "blerje-tvsh", ico: "B", title: "Libri i Blerjes TVSH", desc: "Fatura + shpenzime" },
    { id: "kuartale", ico: "K", title: "Libra kuartale", desc: "Shitje & blerje pa TVSH" },
    { id: "deklarata", ico: "D", title: "Deklarata e TVSH-së", desc: "Kutizat [9]–[67]" },
    { id: "shpenzime", ico: "€", title: "Shpenzimet", desc: "Regjistrim i brendshëm" },
    { id: "paga", ico: "P", title: "Pagat & Tatim në burim", desc: "Lista e pagave" },
    { id: "qera", ico: "Q", title: "Qera & TMB", desc: "Lista e qerase" },
    { id: "tremujor", ico: "T", title: "Formulari tremujor", desc: "Kësti i tatimit" },
    { id: "vjetore", ico: "V", title: "Pasqyra vjetore", desc: "CD & pasqyrat" },
  ],

  ensureStyles() {
    if (document.getElementById("kontabilisti-ui-css")) return;
    const link = document.createElement("link");
    link.id = "kontabilisti-ui-css";
    link.rel = "stylesheet";
    link.href = "/css/kontabilisti-ui.css?v=1.0.4";
    document.head.appendChild(link);
  },

  ymd(d) {
    const x = d instanceof Date ? d : new Date(d);
    const pad = (n) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  },

  fmtEuro(n) {
    return `${KAPI.fmt(n)} €`;
  },

  money(n) {
    return KONT_ATK.money(n);
  },

  downloadCSV(filename, headers, rows) {
    if (window.CsvExport) return CsvExport.save(filename, headers, rows);
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(esc).join(";")];
    rows.forEach((r) => lines.push(r.map(esc).join(";")));
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  exportToolbar(opts = {}) {
    return window.CsvExport?.toolbar(opts) || "";
  },

  bindPrintPdfCsv(host, handlers = {}) {
    host.querySelector("[data-action='print']")?.addEventListener("click", () => handlers.print?.());
    host.querySelector("[data-action='pdf']")?.addEventListener("click", () => handlers.pdf?.());
    host.querySelector("[data-action='csv']")?.addEventListener("click", () => handlers.csv?.());
  },

  rangeForKontPreset(preset) {
    const today = this.ymd(new Date());
    const now = new Date();
    if (preset === "sot") return { from: today, to: today };
    if (preset === "java") {
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      return { from: this.ymd(monday), to: today };
    }
    if (preset === "muaj") {
      return { from: this.ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    }
    if (preset === "tremujor") {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return { from: this.ymd(new Date(now.getFullYear(), q, 1)), to: today };
    }
    if (preset === "vit") {
      return { from: this.ymd(new Date(now.getFullYear(), 0, 1)), to: today };
    }
    return { from: today, to: today };
  },

  atkContext() {
    const t = this.state.data.totals;
    const b = this.state.data.boxes;
    const salesBoxes = KONT_ATK.salesBoxesFromTotals(t, b);
    const purchBoxes = KONT_ATK.purchaseBoxesFromTotals(t);
    const declaration = KONT_ATK.buildVatDeclarationFromBoxes(b, t);
    const shpenzimeOp = this.money(t.purchaseGross * 0.05);
    const fitim = this.money(t.salesGross - t.purchaseGross - t.expenseTotal - shpenzimeOp + t.expenseTotal);
    return { t, b, salesBoxes, purchBoxes, declaration, shpenzimeOp, fitim: t.netProfit };
  },

  statCard(label, value, border) {
    const bc = border ? ` dashboard-kpi-${border}` : "";
    return `<div class="dashboard-kpi${bc}"><div class="dashboard-kpi-label">${label}</div><div class="dashboard-kpi-val">${value}</div></div>`;
  },

  declGrid(boxes, wide) {
    const cls = wide ? "kont-decl-grid kont-decl-grid-wide" : "kont-decl-grid";
    return `<div class="${cls}">${Object.entries(boxes || {}).map(([lbl, val]) =>
      `<div class="kont-decl-box"><div class="lbl">${lbl}</div><div class="val">${typeof val === "number" ? this.fmtEuro(val) : val}</div></div>`
    ).join("")}</div>`;
  },

  secShell(title, note, actionsHtml, bodyHtml) {
    return `
      <div class="kont-sec open">
        <button type="button" class="btn btn-ghost btn-sm kont-sec-back" id="kont-back">← Kthehu</button>
        <div class="card kont-sec-card">
          <div class="purchases-history-head">
            <div class="settings-card-title">${title}</div>
            <div class="purchases-filter-bar">${actionsHtml || ""}</div>
          </div>
          ${note ? `<p class="kont-sec-note">${note}</p>` : ""}
          ${bodyHtml}
        </div>
      </div>`;
  },

  secBackBtn() {
    return `<button type="button" class="btn btn-ghost btn-sm kont-sec-back" id="kont-back">← Kthehu</button>`;
  },

  periodHint() {
    const s = this.state.data?.settings || {};
    const t = this.state.data?.totals || {};
    const name = s.business_legal_name || s.business_trade_name || "—";
    const nui = s.nui || "—";
    const rate = KONT_ATK.avgHourRateFromSales(t.salesGross, s);
    const rateTxt = rate > 0 ? ` · Tarifa mesatare/orë: ${this.fmtEuro(rate)}` : "";
    return `Intervali aktiv: ${this.state.applied.from} — ${this.state.applied.to}${rateTxt} · Kompania: ${name} · NUI: ${nui}`;
  },

  async fetchSummary(from, to) {
    return KAPI.api(`/kontabilisti/summary?from=${from}&to=${to}`);
  },

  async init() {
    this.ensureStyles();
    const init = this.rangeForKontPreset("muaj");
    this.state.dateFrom = init.from;
    this.state.dateTo = init.to;
    this.state.applied = { ...init };
    this.state.sec = null;
    if (!this.state.rentRows.length) {
      const s = (await this.fetchSummary(init.from, init.to)).settings || {};
      this.state.rentRows = [{ id: "rent-1", nui: s.nui || "", name: "Qera", rentGross: 0, interest: 0 }];
    }
    await this.reload();
    this.render();
  },

  async reload() {
    this.state.data = await this.fetchSummary(this.state.applied.from, this.state.applied.to);
  },

  async refresh() {
    const sec = this.state.sec;
    await this.reload();
    if (sec) await this.renderSection(sec);
    else this.render();
  },

  render() {
    const root = document.getElementById("module-root");
    const sec = this.state.sec;
    root.innerHTML = `
      <div class="st-kontabilisti">
        <div class="reports-panel-header">
          <div>
            <h2 class="reports-panel-title">Kontabilisti</h2>
            <p class="reports-panel-sub">Libra dhe formularë ATK — shitjet, blerjet, TVSH, paga, qera, tremujori dhe pasqyra vjetore</p>
          </div>
        </div>
        <div class="card kont-period-card" style="margin-bottom:1rem">
          <div class="purchases-history-head st-kont-period-head">
            <div class="settings-card-title">Periudha</div>
            <div class="purchases-filter-bar">
              ${this.PERIODS.map((p) => `
                <button type="button" class="btn btn-sm kont-period-btn${this.state.period === p.id ? " btn-primary active" : " btn-ghost"}"
                  data-preset="${p.id}">${p.label}</button>`).join("")}
            </div>
            <div class="purchases-filter-bar">
              <input type="date" id="kont-from" value="${this.state.dateFrom}">
              <span class="reports-range-sep">—</span>
              <input type="date" id="kont-to" value="${this.state.dateTo}">
              <button type="button" class="btn btn-primary btn-sm" id="kont-apply">Apliko</button>
            </div>
          </div>
          <div class="fiscal-save-msg st-kont-hint">${this.periodHint()}</div>
        </div>
        <div id="kont-body">${sec ? "" : this.renderHub()}</div>
      </div>`;
    this.bindShellEvents();
    if (sec) this.renderSection(sec);
  },

  renderHub() {
    const t = this.state.data?.totals || {};
    const vatPay = Number(t.vatPayable || 0);
    const vatLbl = vatPay >= 0 ? "TVSH për pagesë" : "TVSH për kthim";
    const monthLbl = this.state.applied
      ? `${this.state.applied.from.slice(0, 7)}`
      : "—";
    return `
      <div class="kont-kpi-panel" style="margin-bottom:1rem">
        <div class="dashboard-kpi-row sec-pasqyra-kpis st-pasqyra-kpis kont-hub-kpis">
          ${this.statCard("Shitjet totale", this.fmtEuro(t.salesGross), "green")}
          ${this.statCard("Blerjet totale", this.fmtEuro(t.purchaseGross), "orange")}
          ${this.statCard("Shpenzimet totale", this.fmtEuro(t.expenseTotal), "red")}
          ${this.statCard("TVSH e daljes", this.fmtEuro(t.outputVat), "green")}
          ${this.statCard("TVSH e hyrjes", this.fmtEuro(t.inputVat), "orange")}
          ${this.statCard(vatLbl, this.fmtEuro(Math.abs(vatPay)), vatPay >= 0 ? "red" : "blue")}
          ${this.statCard("Fitimi bruto", this.fmtEuro(t.grossProfit), "blue")}
          ${this.statCard("Fitimi neto", this.fmtEuro(t.netProfit), "blue")}
          ${this.statCard("Nr. faturave", String(t.invoiceCount || 0), "")}
          ${this.statCard("Periudha", monthLbl, "")}
        </div>
        <p class="kont-sec-note" style="margin:0.65rem 0 0">TVSH 18%: ${this.fmtEuro(t.salesVat18)} · TVSH 8%: ${this.fmtEuro(t.salesVat8)} · Z-Raporte: ${t.zReports || 0} · B2B: ${t.b2bCount || 0} · Blerje: ${t.purchaseCount || 0} · Shpenzime: ${t.expenseCount || 0}</p>
      </div>
      <div class="kont-hub-grid" role="navigation" aria-label="Seksionet e kontabilistit">${this.HUB.map((h) => `
      <button type="button" class="kont-hub-btn" data-sec="${h.id}">
        <span class="kont-hub-ico">${h.ico}</span><strong>${h.title}</strong><span>${h.desc}</span>
      </button>`).join("")}</div>`;
  },

  bindShellEvents() {
    const root = document.getElementById("module-root");
    root.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.onclick = () => this.applyPreset(btn.dataset.preset);
    });
    document.getElementById("kont-from")?.addEventListener("change", (e) => {
      this.state.dateFrom = e.target.value;
      this.state.period = "lire";
    });
    document.getElementById("kont-to")?.addEventListener("change", (e) => {
      this.state.dateTo = e.target.value;
      this.state.period = "lire";
    });
    document.getElementById("kont-apply")?.addEventListener("click", async () => {
      this.state.period = "lire";
      this.state.applied = { from: this.state.dateFrom, to: this.state.dateTo };
      await this.reload();
      this.render();
    });
    root.querySelectorAll(".kont-hub-btn").forEach((btn) => {
      btn.onclick = () => { this.state.sec = btn.dataset.sec; this.render(); };
    });
  },

  async applyPreset(id) {
    this.state.period = id;
    if (id === "lire") { this.render(); return; }
    const r = this.rangeForKontPreset(id);
    this.state.dateFrom = r.from;
    this.state.dateTo = r.to;
    this.state.applied = { ...r };
    await this.reload();
    this.render();
  },

  bindBack(host) {
    host.querySelector("#kont-back")?.addEventListener("click", () => {
      this.state.sec = null;
      this.render();
    });
  },

  async renderSection(id) {
    const host = document.getElementById("kont-body");
    if (!host) return;
    this._exportPayload = {};
    try {
      const fns = {
        bilanc: () => this.sectionBilanc(),
        "shitje-tvsh": () => this.sectionShitjeTvsh(),
        "blerje-tvsh": () => this.sectionBlerjeTvsh(),
        kuartale: () => this.sectionKuartale(),
        deklarata: () => this.sectionDeklarata(),
        shpenzime: () => this.sectionShpenzime(),
        paga: () => this.sectionPaga(),
        qera: () => this.sectionQera(),
        tremujor: () => this.sectionTremujor(),
        vjetore: () => this.sectionVjetore(),
      };
      host.innerHTML = await fns[id]?.() || `<div class="card"><p class="purchases-empty">Seksioni «${id}» nuk u gjet.</p></div>`;
    } catch (e) {
      host.innerHTML = `<div class="card"><p style="color:var(--danger)">Gabim: ${e.message || e}</p>${this.secBackBtn()}</div>`;
    }
    this.bindBack(host);
    document.getElementById("year-apply")?.addEventListener("click", async () => {
      this.state.yearAnnual = document.getElementById("year-annual").value;
      await this.renderSection("vjetore");
    });
    document.getElementById("prior-tax-apply")?.addEventListener("click", async () => {
      this.state.priorTax = document.getElementById("prior-tax")?.value || "0";
      await this.renderSection("tremujor");
    });
    this.bindSectionExports(id, host);
    if (id === "shpenzime") this.bindExpenseForm(host);
    if (id === "qera") this.bindQeraForm(host);
  },

  bindSectionExports(id, host) {
    const printBody = host.querySelector(".kont-sec-card")?.innerHTML || host.innerHTML;
    const settings = this.state.data?.settings || {};
    const from = this.state.applied?.from;
    const to = this.state.applied?.to;
    const title = host.querySelector(".settings-card-title")?.textContent || id;

    window.printContext = {
      print: () => PdfExport.printHtmlSync(title, printBody, settings, from, to),
      pdf: () => PdfExport.exportPdfSync(title, printBody, settings, from, to),
    };

    host.querySelectorAll("[data-action='print']").forEach((btn) => {
      btn.onclick = () => window.printContext?.print?.();
    });
    host.querySelectorAll("[data-action='pdf']").forEach((btn) => {
      btn.onclick = () => window.printContext?.pdf?.();
    });
    host.querySelectorAll("[data-action='csv']").forEach((btn) => {
      const fn = this._exportPayload?.[btn.dataset.csvId || "csv"];
      if (fn) btn.onclick = fn;
    });
  },

  sectionBilanc() {
    const { t } = this.atkContext();
    this._exportPayload["bilanc-csv"] = () => this.downloadCSV("bilanc.csv", ["Zëri", "Vlera"], [
      ["Shitjet", CsvExport.fmtNum(t.salesGross)], ["Blerjet", CsvExport.fmtNum(t.purchaseGross)],
      ["Shpenzimet", CsvExport.fmtNum(t.expenseTotal)], ["Fitimi", CsvExport.fmtNum(t.netProfit)],
    ]);
    return this.secShell(
      "Bilanci i brendshëm",
      "SHITJET − BLERJET − SHPENZIMET = FITIMI",
      `${this.exportToolbar({ pdf: true })}<button type="button" class="btn btn-csv btn-sm" data-action="csv" data-csv-id="bilanc-csv">📥 Eksporto CSV</button>`,
      `<div class="kont-kpi-panel"><div class="dashboard-kpi-row sec-pasqyra-kpis st-pasqyra-kpis">
        ${this.statCard("SHITJET", this.fmtEuro(t.salesGross), "green")}
        ${this.statCard("BLERJET", this.fmtEuro(t.purchaseGross), "orange")}
        ${this.statCard("SHPENZIMET", this.fmtEuro(t.expenseTotal), "red")}
        ${this.statCard("FITIMI", this.fmtEuro(t.netProfit), "blue")}
      </div></div>`
    );
  },

  async sectionShitjeTvsh() {
    const q = `from=${this.state.applied.from}&to=${this.state.applied.to}`;
    const [z, inv] = await Promise.all([
      KAPI.api(`/z-reports?${q}`),
      KAPI.api(`/sales-invoices?${q}&status=finalized`),
    ]);
    const zRows = (z.rows || []).slice().sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
    const b2bRows = (inv.rows || []).slice().sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)));

    const sumZ = (fn) => zRows.reduce((a, r) => a + fn(r), 0);

    const zSub = {
      b18: sumZ((r) => r.sales_18_base || 0), v18: sumZ((r) => r.sales_18_vat || 0),
      b8: sumZ((r) => r.sales_8_base || 0), v8: sumZ((r) => r.sales_8_vat || 0),
      b0: sumZ((r) => r.sales_0_total || 0), tot: sumZ((r) => r.grand_total || 0),
    };
    const bSub = { b18: 0, v18: 0, b8: 0, v8: 0, b0: 0, tot: 0 };
    b2bRows.forEach((r) => {
      const b8 = (r.vat_8 || 0) > 0 ? Math.round((r.vat_8 / 0.08) * 100) / 100 : 0;
      const b18 = Math.max(0, Math.round(((r.subtotal || 0) - b8 - (r.vat_0_base || 0)) * 100) / 100);
      bSub.b18 += b18; bSub.v18 += r.vat_18 || 0;
      bSub.b8 += b8; bSub.v8 += r.vat_8 || 0;
      bSub.b0 += r.vat_0_base || 0; bSub.tot += r.grand_total || 0;
    });

    const grand = {
      b18: zSub.b18 + bSub.b18, v18: zSub.v18 + bSub.v18,
      b8: zSub.b8 + bSub.b8, v8: zSub.v8 + bSub.v8,
      b0: zSub.b0 + bSub.b0, tot: zSub.tot + bSub.tot,
    };

    const { salesBoxes, t } = this.atkContext();

    this._exportPayload["shitje-csv"] = () => {
      const CE = CsvExport;
      const headers = ["Seksioni", "Data", "Nr. Dokumentit", "Pala", "Baza 18%", "TVSH 18%", "Baza 8%", "TVSH 8%", "Baza 0%", "Totali"];
      const rows = [];
      zRows.forEach((r) => rows.push([
        "Z-Raport", CE.fmtDate(r.report_date), r.report_number || "",
        r.fiscal_device || "—",
        CE.fmtNum(r.sales_18_base), CE.fmtNum(r.sales_18_vat),
        CE.fmtNum(r.sales_8_base), CE.fmtNum(r.sales_8_vat),
        CE.fmtNum(r.sales_0_total), CE.fmtNum(r.grand_total),
      ]));
      rows.push(["", "", "", "NËNTOTALI Z", CE.fmtNum(zSub.b18), CE.fmtNum(zSub.v18), CE.fmtNum(zSub.b8), CE.fmtNum(zSub.v8), CE.fmtNum(zSub.b0), CE.fmtNum(zSub.tot)]);
      b2bRows.forEach((r) => {
        const b8 = (r.vat_8 || 0) > 0 ? (r.vat_8 / 0.08) : 0;
        const b18 = Math.max(0, (r.subtotal || 0) - b8 - (r.vat_0_base || 0));
        rows.push(["B2B", CE.fmtDate(r.invoice_date), r.invoice_number, r.client_name || "",
          CE.fmtNum(b18), CE.fmtNum(r.vat_18), CE.fmtNum(b8), CE.fmtNum(r.vat_8), CE.fmtNum(r.vat_0_base), CE.fmtNum(r.grand_total)]);
      });
      rows.push(["", "", "", "NËNTOTALI B2B", CE.fmtNum(bSub.b18), CE.fmtNum(bSub.v18), CE.fmtNum(bSub.b8), CE.fmtNum(bSub.v8), CE.fmtNum(bSub.b0), CE.fmtNum(bSub.tot)]);
      rows.push(["", "", "", "TOTALI", CE.fmtNum(grand.b18), CE.fmtNum(grand.v18), CE.fmtNum(grand.b8), CE.fmtNum(grand.v8), CE.fmtNum(grand.b0), CE.fmtNum(grand.tot)]);
      CE.save(`libri-shitjeve_${CE.quarterSuffix(this.state.applied.from)}.csv`, headers, rows);
    };

    const zTable = zRows.length ? zRows.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${KAPI.fmtDate(r.report_date)}</td><td>${r.report_number || "—"}</td>
      <td>${this.fmtEuro(r.sales_18_base)}</td><td>${this.fmtEuro(r.sales_18_vat)}</td>
      <td>${this.fmtEuro(r.sales_8_base)}</td><td>${this.fmtEuro(r.sales_8_vat)}</td>
      <td>${this.fmtEuro(r.sales_0_total)}</td><td>${this.fmtEuro(r.grand_total)}</td>
    </tr>`).join("") : '<tr><td colspan="9" class="purchases-empty">Pa Z-Raporte</td></tr>';

    const b2bTable = b2bRows.length ? b2bRows.map((r, i) => {
      const b8 = (r.vat_8 || 0) > 0 ? (r.vat_8 / 0.08) : 0;
      const b18 = Math.max(0, (r.subtotal || 0) - b8 - (r.vat_0_base || 0));
      return `<tr>
        <td>${i + 1}</td><td>${KAPI.fmtDate(r.invoice_date)}</td><td>${r.invoice_number}</td>
        <td>${r.client_name || "—"}</td><td>${r.client_nui || "—"}</td>
        <td>${this.fmtEuro(b18)}</td><td>${this.fmtEuro(r.vat_18)}</td>
        <td>${this.fmtEuro(b8)}</td><td>${this.fmtEuro(r.vat_8)}</td>
        <td>${this.fmtEuro(r.vat_0_base)}</td><td>${this.fmtEuro(r.grand_total)}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="11" class="purchases-empty">Pa fatura B2B</td></tr>';

    return this.secShell(
      "Libri i Shitjes TVSH",
      "Z-Raportet ditore (B2C) + Faturat B2B — bashkohen në kutizat [10a]…[16] të Deklaratës.",
      `${this.exportToolbar({ pdf: true })}<button type="button" class="btn btn-csv btn-sm" data-action="csv" data-csv-id="shitje-csv">📥 Eksporto CSV</button>`,
      `<h4 class="kont-subsec-title">SEKSIONI A — Z-RAPORTET DITORE</h4>
      <div class="kont-table-scroll"><table class="kont-atk-table"><thead><tr>
        <th>Nr.</th><th>Data</th><th>Nr. Z-Raport</th><th>Baza 18%</th><th>TVSH 18%</th><th>Baza 8%</th><th>TVSH 8%</th><th>Baza 0%</th><th>Totali</th>
      </tr></thead><tbody>${zTable}
      ${zRows.length ? `<tr class="kont-subtotal-row"><td colspan="3"><strong>NËNTOTALI Z-RAPORTE</strong></td>
        <td>${this.fmtEuro(zSub.b18)}</td><td>${this.fmtEuro(zSub.v18)}</td>
        <td>${this.fmtEuro(zSub.b8)}</td><td>${this.fmtEuro(zSub.v8)}</td>
        <td>${this.fmtEuro(zSub.b0)}</td><td><strong>${this.fmtEuro(zSub.tot)}</strong></td></tr>` : ""}
      </tbody></table></div>

      <h4 class="kont-subsec-title">SEKSIONI B — FATURAT B2B</h4>
      <div class="kont-table-scroll"><table class="kont-atk-table"><thead><tr>
        <th>Nr.</th><th>Data</th><th>Nr. Faturë</th><th>Klienti</th><th>NUI</th><th>Baza 18%</th><th>TVSH 18%</th><th>Baza 8%</th><th>TVSH 8%</th><th>Baza 0%</th><th>Totali</th>
      </tr></thead><tbody>${b2bTable}
      ${b2bRows.length ? `<tr class="kont-subtotal-row"><td colspan="5"><strong>NËNTOTALI B2B</strong></td>
        <td>${this.fmtEuro(bSub.b18)}</td><td>${this.fmtEuro(bSub.v18)}</td>
        <td>${this.fmtEuro(bSub.b8)}</td><td>${this.fmtEuro(bSub.v8)}</td>
        <td>${this.fmtEuro(bSub.b0)}</td><td><strong>${this.fmtEuro(bSub.tot)}</strong></td></tr>` : ""}
      </tbody></table></div>

      <div class="kont-atk-totals kont-grand-total">
        <strong>TOTALI I PËRGJITHSHËM (Z + B2B):</strong>
        Baza 18% ${this.fmtEuro(grand.b18)} · TVSH 18% ${this.fmtEuro(grand.v18)} ·
        Baza 8% ${this.fmtEuro(grand.b8)} · TVSH 8% ${this.fmtEuro(grand.v8)} ·
        Baza 0% ${this.fmtEuro(grand.b0)} · <strong>Totali ${this.fmtEuro(grand.tot)}</strong>
      </div>
      <div class="kont-atk-totals">DEKLARATA · [10a]=${this.fmtEuro(salesBoxes.box10a || t.salesBase18)} (Z+B2B baza 18%) · [10b]=${this.fmtEuro(t.salesBase8)} · [10c]=${this.fmtEuro(t.salesVat0Base)} · [11]=${this.fmtEuro(salesBoxes.box11 || (t.salesBase18 + t.salesBase8 + t.salesVat0Base))} · [12]=${this.fmtEuro(salesBoxes.box12)} · [14]=${this.fmtEuro(t.salesVat8)} · [16]=${this.fmtEuro(t.outputVat)}</div>`
    );
  },

  async sectionBlerjeTvsh() {
    const q = `from=${this.state.applied.from}&to=${this.state.applied.to}`;
    const [pur, exp] = await Promise.all([KAPI.api(`/purchase-invoices?${q}`), KAPI.api(`/expenses?${q}`)]);
    const rows = [];
    (pur.rows || []).forEach((p) => rows.push({
      date: p.invoice_date, nr: p.invoice_number || "—", seller: p.supplier_name || "—",
      v43: p.subtotal || 0, k1: p.vat_18 || 0, v67: p.vat_total || 0,
    }));
    (exp.rows || []).filter((e) => e.vat_amount > 0).forEach((e) => {
      const base = (e.amount || 0) - (e.vat_amount || 0);
      rows.push({ date: e.expense_date, nr: "—", seller: e.category || "Shpenzim", v43: base, k1: e.vat_amount, v67: e.vat_amount });
    });
    const { purchBoxes } = this.atkContext();
    this._exportPayload["blerje-csv"] = () => {
      const CE = CsvExport;
      const headers = ["Data", "Nr. Faturës", "Furnizuesi", "Baza pa TVSH", "TVSH 18%", "TVSH 8%", "Totali TVSH"];
      const csvRows = rows.map((r) => [
        CE.fmtDate(r.date), r.nr, r.seller,
        CE.fmtNum(r.v43), CE.fmtNum(r.k1), CE.fmtNum(0), CE.fmtNum(r.v67),
      ]);
      csvRows.push(["TOTALI", "", "", CE.fmtNum(purchBoxes.box43), CE.fmtNum(purchBoxes.boxK1), CE.fmtNum(0), CE.fmtNum(purchBoxes.box67)]);
      CE.save(`libri-blerjeve_${CE.quarterSuffix(this.state.applied.from)}.csv`, headers, csvRows);
    };

    return this.secShell(
      "Libri i Blerjes TVSH",
      "Fatura blerjeje + shpenzime → kutizat [31]…[67].",
      `${this.exportToolbar({ pdf: true })}<button type="button" class="btn btn-csv btn-sm" data-action="csv" data-csv-id="blerje-csv">📥 Eksporto CSV</button>`,
      `<div class="kont-table-scroll"><table class="kont-atk-table"><thead><tr>
        <th>Nr</th><th>Data</th><th>Nr. faturës</th><th>Shitësi</th><th>[43] 18%</th><th>[K1]</th><th>[45] 8%</th><th>[K2]</th><th>[67]</th>
      </tr></thead><tbody>${rows.length ? rows.map((r, i) => `<tr>
        <td>${i + 1}</td><td>${KAPI.fmtDate(r.date)}</td><td>${r.nr}</td><td>${r.seller}</td>
        <td>${this.fmtEuro(r.v43)}</td><td>${this.fmtEuro(r.k1)}</td><td>${this.fmtEuro(0)}</td><td>${this.fmtEuro(0)}</td><td>${this.fmtEuro(r.v67)}</td>
      </tr>`).join("") : '<tr><td colspan="9" class="purchases-empty">Nuk ka blerje / shpenzime</td></tr>'}
      </tbody></table></div>
      <div class="kont-atk-totals">TOTALI · [43]=${this.fmtEuro(purchBoxes.box43)} · [K1]=${this.fmtEuro(purchBoxes.boxK1)} · [67]=${this.fmtEuro(purchBoxes.box67)}</div>`
    );
  },

  sectionKuartale() {
    const { t, salesBoxes, purchBoxes } = this.atkContext();
    return this.secShell(
      "Libra kuartale",
      "Shitje & blerje pa TVSH (neto).",
      `<button type="button" class="btn btn-primary btn-sm" data-action="print">Excel ATK</button>`,
      `<div class="kont-kpi-panel"><div class="dashboard-kpi-row sec-pasqyra-kpis st-pasqyra-kpis">
        ${this.statCard("SHITJE PA TVSH", this.fmtEuro(t.salesBase), "green")}
        ${this.statCard("BLERJE PA TVSH", this.fmtEuro(t.purchaseBase), "orange")}
        ${this.statCard("DIFERENCA", this.fmtEuro(this.money(t.salesBase - t.purchaseBase)), "blue")}
      </div></div>`
    );
  },

  sectionDeklarata() {
    const { declaration } = this.atkContext();
    const b = declaration.boxes;
    this._exportPayload["deklarata-csv"] = () => this.downloadCSV("deklarata-tvsh.csv",
      ["Kutiza", "Shuma"], Object.entries(b).map(([k, v]) => [k, CsvExport.fmtNum(v)]));

    return this.secShell(
      "Deklarata e TVSH-së",
      "Mbushen automatikisht nga Libri i Shitjes dhe Libri i Blerjes për periudhën.",
      `${this.exportToolbar({ pdf: true })}<button type="button" class="btn btn-csv btn-sm" data-action="csv" data-csv-id="deklarata-csv">📥 Eksporto CSV</button>`,
      `${this.declGrid(b, true)}
       <div class="kont-decl-summary-row">
         <div class="kont-decl-box kont-decl-box-summary"><div class="lbl">[67] Total TVSH e zbritshme</div><div class="val">${this.fmtEuro(declaration.vat_deductible)}</div></div>
         <div class="kont-decl-box kont-decl-box-summary"><div class="lbl">TVSH për pagesë / (kthim)</div><div class="val">${this.fmtEuro(declaration.vat_payable)}</div></div>
       </div>
       <div class="kont-decl-payable">${declaration.vat_payable >= 0
         ? `TVSH për pagesë: ${this.fmtEuro(declaration.vat_payable)}`
         : `TVSH për kthim: ${this.fmtEuro(Math.abs(declaration.vat_payable))}`}</div>`
    );
  },

  async sectionShpenzime() {
    const q = `from=${this.state.applied.from}&to=${this.state.applied.to}`;
    const [pur, ex] = await Promise.all([KAPI.api(`/purchase-invoices?${q}`), KAPI.api(`/expenses?${q}`)]);
    const s = this.state.data.settings || {};
    const { shpenzimeOp } = this.atkContext();
    const rows = [];
    (pur.rows || []).forEach((p) => rows.push({
      date: p.invoice_date, cat: "Blerje", desc: p.invoice_number || "Faturë", amt: p.grand_total, firm: p.supplier_name,
    }));
    (ex.rows || []).forEach((r) => rows.push({
      date: r.expense_date, cat: r.category, desc: r.description || "—", amt: r.amount, firm: s.business_legal_name,
    }));
    rows.push({ date: this.state.applied.to, cat: "Operative", desc: "5% mbi blerjet", amt: shpenzimeOp, firm: s.business_legal_name });
    this._exportPayload["shpenzime-csv"] = () => this.downloadCSV("shpenzime.csv",
      ["Data", "Kategoria", "Përshkrimi", "Shuma"], rows.map((r) => [r.date, r.cat, r.desc, Number(r.amt).toFixed(2)]));

    return this.secShell(
      "Shpenzimet",
      "Regjistrim i brendshëm — blerjet + 5% operative.",
      `${this.exportBtn("CSV", "shpenzime-csv")}<button type="button" class="btn btn-primary btn-sm" data-action="print">PDF</button>
       <button type="button" class="btn btn-ai-scan btn-sm" id="kont-scan-exp">📷 Skano Shpenzimin</button>
       <button type="button" class="btn btn-ghost btn-sm" id="goto-exp-module">+ Regjistro shpenzim</button>`,
      `<p class="kont-sec-note">Të dhënat vijnë automatikisht nga Blerjet & Shpenzimet. Regjistro te moduli <strong>Blerjet → Shpenzimet</strong>.</p>
      <div class="purchases-table-wrap"><table class="dashboard-top-table purchases-table kont-atk-table"><thead><tr>
        <th>Data</th><th>Kategoria</th><th>Përshkrimi</th><th>Shuma</th><th>Firma</th><th>NUI</th>
      </tr></thead><tbody>${rows.map((r) => `<tr>
        <td>${KAPI.fmtDate(r.date)}</td><td>${r.cat}</td><td>${r.desc}</td><td>${this.fmtEuro(r.amt)}</td><td>${r.firm || "—"}</td><td>${s.nui || "—"}</td>
      </tr>`).join("")}</tbody></table></div>`
    );
  },

  async sectionPaga() {
    const ex = await KAPI.api(`/expenses?from=${this.state.applied.from}&to=${this.state.applied.to}`);
    const s = this.state.data.settings || {};
    const { t } = this.atkContext();
    let payrollRows = KONT_ATK.payrollFromExpenses((ex.rows || []).filter((r) => /pag|paga|rroga/i.test(r.category || "")));
    const fromSales = !payrollRows.length;
    if (fromSales) payrollRows = KONT_ATK.payrollFromSalesGross(t.salesGross, s);
    const withholding = KONT_ATK.buildWithholdingTaxFromPayroll(payrollRows);
    const periodLabel = `${this.state.applied.from} — ${this.state.applied.to}`;
    const note = fromSales
      ? `Llogaritur nga shitjet bruto ÷ tarifa mesatare për periudhën ${periodLabel}.`
      : `Llogaritur nga shpenzimet e kategorisë Pagat për periudhën ${periodLabel}.`;
    this._exportPayload["paga-csv"] = () => this.downloadCSV("paga.csv",
      ["Emri", "Mbiemri", "Orë", "Bruto", "Pens.", "Tatim"],
      payrollRows.map((r) => [r.firstName, r.lastName, r.hours.toFixed(1), r.gross.toFixed(2), r.employeePension.toFixed(2), r.tax.toFixed(2)]));

    return `
      <div class="kont-sec open">${this.secBackBtn()}
        <div class="card kont-sec-card" style="margin-bottom:0.75rem">
          <div class="purchases-history-head">
            <div class="settings-card-title">Lista e pagave</div>
            <div class="purchases-filter-bar">
              ${this.exportBtn("Excel lista", "paga-csv")}
              <button type="button" class="btn btn-primary btn-sm" data-action="print">PDF ATK</button>
            </div>
          </div>
          <p class="kont-sec-note">${note}</p>
          <div class="kont-table-scroll"><table class="kont-atk-table"><thead><tr>
            <th>Emri</th><th>Mbiemri</th><th>Nr. individual</th><th>Orë</th><th>Bruto</th><th>Pens. 5%</th><th>Punëdh. 5%</th><th>Tatim</th>
          </tr></thead><tbody>${payrollRows.length ? payrollRows.map((r) => `<tr>
            <td>${r.firstName}</td><td>${r.lastName}</td><td>${r.individualNumber}</td><td>${r.hours.toFixed(1)}</td>
            <td>${this.fmtEuro(r.gross)}</td><td>${this.fmtEuro(r.employeePension)}</td><td>${this.fmtEuro(r.employerPension)}</td><td>${this.fmtEuro(r.tax)}</td>
          </tr>`).join("") : '<tr><td colspan="8" class="purchases-empty">Pa paga — regjistro te Shpenzimet → kategoria Pagat</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="card kont-sec-card">
          <div class="settings-card-title">Formulari i Tatimit në Burim (paga)</div>
          ${this.declGrid(withholding)}
        </div>
      </div>`;
  },

  sectionQera() {
    const s = this.state.data.settings || {};
    const rentForm = KONT_ATK.buildRentFormBoxes(this.state.rentRows);
    const rowsHtml = this.state.rentRows.map((r) => {
      const tmbRent = this.money(Number(r.rentGross) * 0.09);
      const tmbOther = this.money(Number(r.interest) * 0.1);
      return `<tr data-rent-id="${r.id}">
        <td><input class="st-kont-inline-input" data-field="nui" value="${r.nui || ""}"></td>
        <td><input class="st-kont-inline-input" data-field="name" value="${r.name || ""}"></td>
        <td><input class="st-kont-inline-input" type="number" step="0.01" data-field="rentGross" value="${r.rentGross || 0}"></td>
        <td>${this.fmtEuro(tmbRent)}</td>
        <td><input class="st-kont-inline-input" type="number" step="0.01" data-field="interest" value="${r.interest || 0}"></td>
        <td>${this.fmtEuro(tmbOther)}</td>
        <td>${this.fmtEuro(tmbRent + tmbOther)}</td>
        <td><button type="button" class="btn btn-ghost btn-sm" data-rent-del="${r.id}">Fshi</button></td>
      </tr>`;
    }).join("");

    return `
      <div class="kont-sec open">${this.secBackBtn()}
        <div class="card kont-sec-card" style="margin-bottom:0.75rem">
          <div class="purchases-history-head">
            <div class="settings-card-title">Lista e qerase</div>
            <div class="purchases-filter-bar">
              <button type="button" class="btn btn-primary btn-sm" id="add-rent">+ Qera / pagesë</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="print">PDF ATK</button>
            </div>
          </div>
          <div class="kont-table-scroll"><table class="kont-atk-table"><thead><tr>
            <th>NUI</th><th>Emri</th><th>Qera bruto</th><th>TMB 9%</th><th>Interes</th><th>TMB tjetër</th><th>Total TMB</th><th></th>
          </tr></thead><tbody>${rowsHtml || `<tr><td colspan="8" class="purchases-empty">Shto qera me butonin + Qera / pagesë</td></tr>`}</tbody></table></div>
        </div>
        <div class="card kont-sec-card">
          <div class="settings-card-title">Formulari TMB (qera)</div>
          ${this.declGrid(rentForm)}
        </div>
      </div>`;
  },

  bindQeraForm(host) {
    host.querySelector("#add-rent")?.addEventListener("click", async () => {
      const s = this.state.data.settings || {};
      this.state.rentRows.push({ id: `rent-${Date.now()}`, nui: s.nui || "", name: "Qera e re", rentGross: 0, interest: 0 });
      await this.renderSection("qera");
    });
    host.querySelectorAll("[data-rent-del]").forEach((btn) => {
      btn.onclick = async () => {
        this.state.rentRows = this.state.rentRows.filter((r) => r.id !== btn.dataset.rentDel);
        await this.renderSection("qera");
      };
    });
    host.querySelectorAll("[data-rent-id] input").forEach((inp) => {
      inp.addEventListener("change", async () => {
        const tr = inp.closest("[data-rent-id]");
        const id = tr.dataset.rentId;
        const row = this.state.rentRows.find((r) => r.id === id);
        if (!row) return;
        const f = inp.dataset.field;
        row[f] = inp.type === "number" ? Number(inp.value) : inp.value;
        await this.renderSection("qera");
      });
    });
  },

  sectionTremujor() {
    const { t } = this.atkContext();
    const quarterly = KONT_ATK.buildQuarterlyInstallment({
      income: t.salesGross,
      expenses: this.money(t.purchaseGross + t.expenseTotal),
      priorYearTax: Number(this.state.priorTax) || 0,
    });
    return this.secShell(
      "Formulari tremujor",
      "Kësti i tatimit — opsioni A nga të dhënat e periudhës.",
      `<label class="kont-inline-label">Tatimi vit kaluar
        <input type="number" id="prior-tax" value="${this.state.priorTax}" style="width:7rem;margin-left:0.35rem">
        <button type="button" class="btn btn-ghost btn-sm" id="prior-tax-apply">Apliko</button></label>
       <button type="button" class="btn btn-primary btn-sm" data-action="print">PDF ATK</button>`,
      this.declGrid(quarterly)
    );
  },

  async sectionVjetore() {
    const y = this.state.yearAnnual;
    const data = await this.fetchSummary(`${y}-01-01`, `${y}-12-31`);
    const t = data.totals;
    const s = data.settings || {};
    const ex = await KAPI.api(`/expenses?from=${y}-01-01&to=${y}-12-31`);
    let wages = (ex.rows || []).filter((r) => /pag|paga|rroga/i.test(r.category || "")).reduce((a, r) => a + Number(r.amount || 0), 0);
    if (!wages) wages = t.salesGross;
    const annualCd = KONT_ATK.buildAnnualCdBoxes({ sales: t.salesGross, purchases: t.purchaseGross, expenses: t.expenseTotal, wages });
    const addr = [s.business_city, s.business_address].filter(Boolean).join(", ");

    return this.secShell(
      "Pasqyra vjetore",
      `CD & pasqyrat — viti ${y}`,
      `<label class="kont-inline-label">Viti <input type="number" id="year-annual" value="${y}" style="width:5rem;margin-left:0.35rem"></label>
       <button type="button" class="btn btn-primary btn-sm" id="year-apply">Apliko</button>
       ${this.exportToolbar({ pdf: true })}`,
      `<p class="kont-sec-note">${s.business_legal_name || "—"} · NUI ${s.nui || "—"} · ${addr || "—"} · Sot ${this.ymd(new Date())}</p>
       ${this.declGrid(annualCd)}`
    );
  },

  bindExpenseForm(host) {
    host.querySelector("#goto-exp-module")?.addEventListener("click", () => {
      sessionStorage.setItem("blerjet-tab", "shpenzime");
      if (window.kontabilistiNavigate) window.kontabilistiNavigate("blerjet");
    });
    host.querySelector("#kont-scan-exp")?.addEventListener("click", () => {
      sessionStorage.setItem("blerjet-tab", "shpenzime");
      sessionStorage.setItem("blerjet-open-ai-expense", "1");
      if (window.kontabilistiNavigate) window.kontabilistiNavigate("blerjet");
    });
  },
};
