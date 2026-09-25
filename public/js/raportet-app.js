const RaportetApp = {
  filter: "month",
  periodFrom: "",
  periodTo: "",
  settings: {},

  periodBounds() {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    let from;
    if (this.filter === "today") from = to;
    else if (this.filter === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString().slice(0, 10);
    } else if (this.filter === "quarter") {
      const q = Math.floor(now.getMonth() / 3) * 3;
      from = `${now.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
    } else {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    }
    return { from, to };
  },

  reportToolbar(key) {
    return `<div class="report-actions toolbar" style="margin:0" data-report="${key}">
      ${CsvExport.toolbar({ print: true, pdf: true, csv: true })}
    </div>`;
  },

  bindReportActions(root) {
    root.querySelectorAll("[data-report]").forEach((bar) => {
      const key = bar.dataset.report;
      const exp = this._exports[key];
      if (!exp) return;
      bar.querySelector("[data-action='csv']")?.addEventListener("click", () => {
        CsvExport.save(exp.filename, exp.headers, exp.rows);
      });
      bar.querySelector("[data-action='print']")?.addEventListener("click", () => {
        PdfExport.printHtmlSync(exp.title, exp.html, this.settings, this.periodFrom, this.periodTo);
      });
      bar.querySelector("[data-action='pdf']")?.addEventListener("click", () => {
        PdfExport.exportPdfSync(exp.title, exp.html, this.settings, this.periodFrom, this.periodTo);
      });
    });
  },

  tableHtml(headers, bodyRows, footHtml = "") {
    return `<table class="data-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="${headers.length}">Pa të dhëna</td></tr>`}</tbody>
      ${footHtml ? `<tfoot>${footHtml}</tfoot>` : ""}</table>`;
  },

  async init() {
    const root = document.getElementById("module-root");
    root.innerHTML = `
      <div class="tabs">
        <button class="tab ${this.filter === "today" ? "active" : ""}" data-f="today">Sot</button>
        <button class="tab ${this.filter === "week" ? "active" : ""}" data-f="week">Javë</button>
        <button class="tab ${this.filter === "month" ? "active" : ""}" data-f="month">Muaj</button>
        <button class="tab ${this.filter === "quarter" ? "active" : ""}" data-f="quarter">Tremujor</button>
      </div>
      <div id="rap-content"></div>`;
    root.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => { this.filter = t.dataset.f; this.init(); };
    });

    const { from, to } = this.periodBounds();
    this.periodFrom = from;
    this.periodTo = to;
    this._exports = {};

    const q = `from=${from}&to=${to}`;
    const [summary, z, sales, purchases, expenses, settingsRes] = await Promise.all([
      KAPI.api(`/kontabilisti/summary?${q}`),
      KAPI.api(`/z-reports?${q}`),
      KAPI.api(`/sales-invoices?${q}&status=finalized`),
      KAPI.api(`/purchase-invoices?${q}`),
      KAPI.api(`/expenses?${q}`),
      KAPI.api("/settings"),
    ]);
    const t = summary.totals;
    this.settings = settingsRes.settings || {};

    const salesRows = [
      ...z.rows.map((r) => ({
        date: r.report_date,
        type: "Z-Raport",
        nr: r.report_number || "—",
        party: r.device_name || "—",
        total: r.grand_total,
        vat: (r.sales_18_vat || 0) + (r.sales_8_vat || 0),
      })),
      ...sales.rows.map((r) => ({
        date: r.invoice_date,
        type: "B2B",
        nr: r.invoice_number,
        party: r.client_name,
        total: r.grand_total,
        vat: r.vat_total,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    const purchaseRows = purchases.rows.map((r) => ({
      date: r.invoice_date,
      nr: r.internal_number || r.invoice_number || "—",
      party: r.supplier_name,
      total: r.grand_total,
      vat: r.vat_total,
    }));

    const expenseRows = expenses.rows.map((r) => ({
      date: r.expense_date,
      category: r.category,
      desc: r.description || "—",
      total: r.amount,
      vat: r.vat_amount,
    }));

    const CE = CsvExport;
    const suffix = CE.monthSuffix(from);

    const salesBody = salesRows.map((r) =>
      `<tr><td>${KAPI.fmtDate(r.date)}</td><td>${r.type}</td><td>${r.nr}</td><td>${r.party}</td><td>${KAPI.fmt(r.total)} €</td><td>${KAPI.fmt(r.vat)}</td></tr>`
    ).join("");
    const salesTable = this.tableHtml(
      ["Data", "Tipi", "Nr.", "Palë", "Totali", "TVSH"],
      salesBody,
      `<tr><td colspan="4"><b>TOTALI</b></td><td>${KAPI.fmt(t.salesGross)} €</td><td>${KAPI.fmt(t.outputVat)}</td></tr>`
    );

    const purBody = purchaseRows.map((r) =>
      `<tr><td>${KAPI.fmtDate(r.date)}</td><td>${r.nr}</td><td>${r.party}</td><td>${KAPI.fmt(r.total)} €</td><td>${KAPI.fmt(r.vat)}</td></tr>`
    ).join("");
    const purVatTotal = purchaseRows.reduce((a, r) => a + (r.vat || 0), 0);
    const purTable = this.tableHtml(
      ["Data", "Nr.", "Furnitori", "Totali", "TVSH zbritshme"],
      purBody,
      `<tr><td colspan="3"><b>TOTALI</b></td><td>${KAPI.fmt(t.purchaseGross)} €</td><td>${KAPI.fmt(purVatTotal)}</td></tr>`
    );

    const expBody = expenseRows.map((r) =>
      `<tr><td>${KAPI.fmtDate(r.date)}</td><td>${r.category}</td><td>${r.desc}</td><td>${KAPI.fmt(r.total)} €</td><td>${KAPI.fmt(r.vat)}</td></tr>`
    ).join("");
    const expVatTotal = expenseRows.reduce((a, r) => a + (r.vat || 0), 0);
    const expTable = this.tableHtml(
      ["Data", "Kategoria", "Përshkrimi", "Shuma", "TVSH zbritshme"],
      expBody,
      `<tr><td colspan="3"><b>TOTALI</b></td><td>${KAPI.fmt(t.expenseTotal)} €</td><td>${KAPI.fmt(expVatTotal)}</td></tr>`
    );

    this._exports.shitje = {
      title: "Libri i Shitjeve",
      filename: `libri_shitjeve_${suffix}.csv`,
      headers: ["Data", "Tipi", "Nr.", "Palë", "Totali", "TVSH"],
      rows: salesRows.map((r) => [CE.fmtDate(r.date), r.type, r.nr, r.party, CE.fmtNum(r.total), CE.fmtNum(r.vat)]),
      html: salesTable,
    };
    this._exports.blerje = {
      title: "Libri i Blerjeve",
      filename: `libri_blerjeve_${suffix}.csv`,
      headers: ["Data", "Nr.", "Furnitori", "Totali", "TVSH zbritshme"],
      rows: purchaseRows.map((r) => [CE.fmtDate(r.date), r.nr, r.party, CE.fmtNum(r.total), CE.fmtNum(r.vat)]),
      html: purTable,
    };
    this._exports.shpenzime = {
      title: "Libri i Shpenzimeve",
      filename: `libri_shpenzimeve_${suffix}.csv`,
      headers: ["Data", "Kategoria", "Përshkrimi", "Shuma", "TVSH zbritshme"],
      rows: expenseRows.map((r) => [CE.fmtDate(r.date), r.category, r.desc, CE.fmtNum(r.total), CE.fmtNum(r.vat)]),
      html: expTable,
    };

    document.getElementById("rap-content").innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><div class="label">Shitje (periudhë)</div><div class="value">${KAPI.fmt(t.salesGross)} €</div></div>
        <div class="kpi-card"><div class="label">Blerje (periudhë)</div><div class="value">${KAPI.fmt(t.purchaseGross)} €</div></div>
        <div class="kpi-card"><div class="label">Shpenzime</div><div class="value">${KAPI.fmt(t.expenseTotal)} €</div></div>
        <div class="kpi-card"><div class="label">TVSH për pagesë</div><div class="value">${KAPI.fmt(t.vatPayable)} €</div></div>
        <div class="kpi-card"><div class="label">Fitimi neto</div><div class="value">${KAPI.fmt(t.netProfit)} €</div></div>
        <div class="kpi-card"><div class="label">Nr. faturave</div><div class="value">${t.invoiceCount || 0}</div></div>
      </div>
      <div class="card">
        <div class="report-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <h3 style="margin:0">Libri i Shitjeve (Z + B2B)</h3>
          ${this.reportToolbar("shitje")}
        </div>
        ${salesTable}
      </div>
      <div class="card">
        <div class="report-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <h3 style="margin:0">Libri i Blerjeve</h3>
          ${this.reportToolbar("blerje")}
        </div>
        ${purTable}
      </div>
      <div class="card">
        <div class="report-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <h3 style="margin:0">Libri i Shpenzimeve</h3>
          ${this.reportToolbar("shpenzime")}
        </div>
        ${expTable}
      </div>`;

    this.bindReportActions(document.getElementById("rap-content"));
  },
};
