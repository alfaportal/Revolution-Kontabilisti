/** Klientët B2B — regjistrimi i blerësve për fatura */
const KlientetApp = {
  async init() {
    const root = document.getElementById("module-root");
    const data = await KAPI.api("/clients");
    root.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-primary" id="add-client">+ Klient i ri</button>
        ${CsvExport.toolbar({ print: false, pdf: false })}
      </div>
      <div class="card" id="client-form" style="display:none">
        <div class="toolbar" style="margin-bottom:12px">
          <button type="button" class="btn btn-ai-scan" id="scan-client-ai">📷 Skano Certifikatën</button>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Emri *</label><input id="c_name"></div>
          <div class="form-group"><label>NUI</label><input id="c_nui" maxlength="9"></div>
          <div class="form-group"><label>Nr. Fiskal</label><input id="c_fiscal"></div>
          <div class="form-group"><label>Adresa</label><input id="c_addr"></div>
          <div class="form-group"><label>Telefoni</label><input id="c_phone"></div>
          <div class="form-group"><label>Email</label><input id="c_email"></div>
        </div>
        <button class="btn btn-primary" id="save-client">Ruaj</button>
      </div>
      <div class="card"><table class="data-table"><thead><tr><th>Emri</th><th>NUI</th><th>Telefoni</th><th></th></tr></thead>
      <tbody>${data.rows.map((c) => `<tr><td>${c.name}</td><td>${c.nui || "—"}</td><td>${c.phone || "—"}</td>
        <td><button class="btn btn-sm btn-danger del-c" data-id="${c.id}">Fshi</button></td></tr>`).join("") || '<tr><td colspan="4">Pa klientë</td></tr>'}</tbody></table></div>`;

    root.querySelector("[data-action='csv']")?.addEventListener("click", () => {
      const CE = CsvExport;
      const headers = ["Emri", "NUI", "Nr. Fiskal", "Adresa", "Telefoni", "Email"];
      const rows = data.rows.map((c) => [
        c.name || "", c.nui || "", c.fiscal_number || "",
        [c.address, c.city].filter(Boolean).join(", "), c.phone || "", c.email || "",
      ]);
      CE.save("klientet-b2b.csv", headers, rows);
    });

    document.getElementById("add-client").onclick = () => {
      document.getElementById("client-form").style.display = "block";
    };
    document.getElementById("scan-client-ai")?.addEventListener("click", () => this.openClientScan());
    document.getElementById("save-client").onclick = async () => {
      await KAPI.api("/clients", { method: "POST", body: {
        name: document.getElementById("c_name").value,
        nui: document.getElementById("c_nui").value,
        fiscal_number: document.getElementById("c_fiscal").value,
        address: document.getElementById("c_addr").value,
        phone: document.getElementById("c_phone").value,
        email: document.getElementById("c_email").value,
      }});
      KAPI.toast("Klienti u shtua");
      this.init();
    };
    root.querySelectorAll(".del-c").forEach((b) => b.onclick = async () => {
      await KAPI.api("/clients/" + b.dataset.id, { method: "DELETE" });
      this.init();
    });
  },

  fillClientFormFromAi(mapped) {
    document.getElementById("client-form").style.display = "block";
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== "") el.value = v; };
    set("c_name", mapped.name);
    set("c_nui", mapped.nui);
    set("c_fiscal", mapped.fiscal_number);
    set("c_addr", mapped.address);
    set("c_phone", mapped.phone);
    set("c_email", mapped.email);
  },

  openClientScan() {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({
      scanType: "client",
      onFillForm: (mapped) => this.fillClientFormFromAi(mapped),
    });
  },
};
