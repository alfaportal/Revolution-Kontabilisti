const DitariApp = {
  _rows: [],

  async init() {
    const root = document.getElementById("module-root");
    const now = new Date();
    const fromDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const toDefault = now.toISOString().slice(0, 10);

    root.innerHTML = `
      <div class="toolbar">
        <input type="date" id="d-from" value="${fromDefault}">
        <span>—</span>
        <input type="date" id="d-to" value="${toDefault}">
        <select id="d-type"><option value="">Të gjitha</option><option value="shitje_z">Z-Raport</option><option value="shitje_b2b">B2B</option><option value="blerje">Blerje</option><option value="shpenzim">Shpenzim</option></select>
        <input type="text" id="d-search" placeholder="Kërkim...">
        <button class="btn btn-secondary" id="d-filter">Filtro</button>
        ${CsvExport.toolbar({ print: false, pdf: false })}
      </div>
      <div class="card"><table class="data-table"><thead><tr>
        <th>Data</th><th>Tipi</th><th>Nr.</th><th>Pala</th><th>Pa TVSH</th><th>TVSH</th><th>Totali</th>
      </tr></thead><tbody id="d-body"></tbody>
      <tfoot><tr><td colspan="4"><b>TOTALI</b></td><td id="d-net"></td><td id="d-vat"></td><td id="d-tot"></td></tr></tfoot></table></div>`;

    const load = async () => {
      const type = document.getElementById("d-type").value;
      const search = document.getElementById("d-search").value;
      const from = document.getElementById("d-from").value;
      const to = document.getElementById("d-to").value;
      const data = await KAPI.api(`/ditari?from=${from}&to=${to}&type=${type}&search=${encodeURIComponent(search)}`);
      this._rows = data.rows || [];
      document.getElementById("d-body").innerHTML = this._rows.map((r) => `<tr>
        <td>${KAPI.fmtDate(r.date)}</td><td>${r.type}</td><td>${r.number || "—"}</td><td>${r.party || "—"}</td>
        <td>${KAPI.fmt(r.net)}</td><td>${KAPI.fmt(r.vat)}</td><td>${KAPI.fmt(r.total)} €</td>
      </tr>`).join("") || '<tr><td colspan="7">Pa transaksione</td></tr>';
      document.getElementById("d-net").textContent = KAPI.fmt(data.totals.net);
      document.getElementById("d-vat").textContent = KAPI.fmt(data.totals.vat);
      document.getElementById("d-tot").textContent = KAPI.fmt(data.totals.total) + " €";
    };
    document.getElementById("d-filter").onclick = load;
    root.querySelector("[data-action='csv']")?.addEventListener("click", async () => {
      const from = document.getElementById("d-from").value;
      const CE = CsvExport;
      const headers = ["Data", "Tipi", "Nr. Dokumentit", "Pala", "Baza pa TVSH", "TVSH", "Totali"];
      const rows = this._rows.map((r) => [
        CE.fmtDate(r.date), r.type, r.number || "", r.party || "",
        CE.fmtNum(r.net), CE.fmtNum(r.vat), CE.fmtNum(r.total),
      ]);
      if (this._rows.length) {
        const net = this._rows.reduce((a, r) => a + Number(r.net || 0), 0);
        const vat = this._rows.reduce((a, r) => a + Number(r.vat || 0), 0);
        const tot = this._rows.reduce((a, r) => a + Number(r.total || 0), 0);
        rows.push(["TOTALI", "", "", "", CE.fmtNum(net), CE.fmtNum(vat), CE.fmtNum(tot)]);
      }
      CE.save(`ditari_${CE.monthSuffix(from)}.csv`, headers, rows);
    });
    await load();
  },
};
