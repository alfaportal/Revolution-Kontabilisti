const PasqyraApp = {
  formatMissingDays(dates) {
    return (dates || []).map((d) => KAPI.fmtDate(d)).join(", ");
  },

  async init() {
    const root = document.getElementById("module-root");
    const [data] = await Promise.all([
      KAPI.api("/dashboard"),
    ]);
    const t = data.totals;
    const missing = data.missingZDays || [];
    const missingBanner = missing.length >= 3
      ? `<div class="alert-banner alert-warn">
          ⚠️ Nuk keni regjistruar Z-Raport për ${missing.length} ditë (${this.formatMissingDays(missing)}).
          Nëse keni pasur shitje ato ditë, regjistroni Z-Raportet te Shitjet → Z-Raportet Ditore.
        </div>`
      : "";

    const maxBar = Math.max(...(data.daily.map((d) => d.total) || [1]), 1);
    const bars = data.daily.map((d) =>
      `<div class="chart-bar" style="height:${Math.round((d.total / maxBar) * 100)}%" title="${d.d}: ${KAPI.fmt(d.total)}"></div>`
    ).join("");

    root.innerHTML = `
      <div id="pasqyra-deadline-banner"></div>
      ${missingBanner}
      <div class="toolbar"><button class="btn btn-secondary" id="refresh-dash">↻ Rifresko</button></div>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="label">Shitjet</div><div class="value">${KAPI.fmt(t.salesGross)} €</div></div>
        <div class="kpi-card"><div class="label">Blerjet</div><div class="value">${KAPI.fmt(t.purchaseGross)} €</div></div>
        <div class="kpi-card"><div class="label">Shpenzimet</div><div class="value">${KAPI.fmt(t.expenseTotal)} €</div></div>
        <div class="kpi-card"><div class="label">Fitimi Bruto</div><div class="value">${KAPI.fmt(t.grossProfit)} €</div></div>
        <div class="kpi-card"><div class="label">Fitimi Neto</div><div class="value">${KAPI.fmt(t.netProfit)} €</div></div>
        <div class="kpi-card"><div class="label">TVSH për pagesë</div><div class="value">${KAPI.fmt(t.vatPayable)} €</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="card"><h3>Shitjet — 30 ditët e fundit</h3><div class="chart-bar-wrap">${bars || '<p class="hint">Pa të dhëna</p>'}</div></div>
        <div class="card"><h3>Top klientët B2B</h3>
          <table class="data-table"><thead><tr><th>Klienti</th><th>Totali</th></tr></thead>
          <tbody>${(data.topClients || []).map(c => `<tr><td>${c.client_name || "—"}</td><td>${KAPI.fmt(c.total)} €</td></tr>`).join("") || '<tr><td colspan="2">Pa të dhëna</td></tr>'}</tbody></table>
        </div>
        <div class="card" style="grid-column:1/-1"><h3>Shpenzimet sipas kategorisë</h3>
          <table class="data-table"><thead><tr><th>Kategoria</th><th>Totali</th></tr></thead>
          <tbody>${(data.expensesByCat || []).map(c => `<tr><td>${c.category}</td><td>${KAPI.fmt(c.total)} €</td></tr>`).join("") || '<tr><td colspan="2">Pa të dhëna</td></tr>'}</tbody></table>
        </div>
      </div>`;

    document.getElementById("refresh-dash").onclick = () => this.init();

    if (window.DeadlineAlertsUI) {
      DeadlineAlertsUI.renderPasqyraBanner(data.alerts, data.settings);
    }
  },
};
