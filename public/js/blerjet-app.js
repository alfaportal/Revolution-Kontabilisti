const BlerjetApp = {
  tab: "blerje",
  pendingPhoto: null,
  pendingExpensePhoto: null,
  aiPrefill: null,

  EXPENSE_CATS: [
    "Qira", "Rryma", "Ujë", "Telefon", "Internet", "Paga", "Karburant",
    "Mirëmbajtje", "Sigurime", "Material zyre", "Tjera",
  ],

  PAY_STATUS_LABELS: { paid: "Paguar", partial: "Pjesërisht", unpaid: "Papaguar" },
  PAY_METHOD_LABELS: { cash: "Para në dorë", card: "Kartë", transfer: "Transfer bankar" },

  async init() {
    const saved = sessionStorage.getItem("blerjet-tab");
    if (saved === "shpenzime") {
      this.tab = "shpenzime";
      sessionStorage.removeItem("blerjet-tab");
    }
    const openAiExpense = sessionStorage.getItem("blerjet-open-ai-expense");
    if (openAiExpense) sessionStorage.removeItem("blerjet-open-ai-expense");
    const root = document.getElementById("module-root");
    root.innerHTML = `
      <div class="tabs">
        <button class="tab ${this.tab === "blerje" ? "active" : ""}" data-tab="blerje">🛒 Faturat blerje</button>
        <button class="tab ${this.tab === "pagesa" ? "active" : ""}" data-tab="pagesa">💳 Pagesat</button>
        <button class="tab ${this.tab === "shpenzime" ? "active" : ""}" data-tab="shpenzime">💸 Shpenzimet</button>
      </div>
      <div id="blerjet-content"></div>`;
    root.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => { this.tab = t.dataset.tab; this.init(); };
    });
    if (this.tab === "shpenzime") {
      await this.renderExpenses();
      if (openAiExpense) setTimeout(() => this.openExpenseAiScan(), 150);
    } else if (this.tab === "pagesa") {
      await this.renderPayments();
    } else {
      await this.renderPurchases();
    }
  },

  photoBtn(kind, id, hasPhoto) {
    if (!hasPhoto) return "";
    return `<button type="button" class="btn btn-sm btn-secondary act-photo" data-kind="${kind}" data-id="${id}" title="Shiko foton">📷</button>`;
  },

  bindPhotoButtons(root) {
    root.querySelectorAll(".act-photo").forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.dataset.kind;
        const id = btn.dataset.id;
        const paths = {
          pur: `/api/purchase-invoices/${id}/photo`,
          exp: `/api/expenses/${id}/photo`,
        };
        KAPI.showPhotoModal(paths[kind] || "", "Foto origjinale");
      };
    });
  },

  showNewInvoiceChoice() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px">
        <h2>Faturë e re</h2>
        <p style="color:var(--text-secondary);margin:12px 0 20px">Si dëshironi ta regjistroni?</p>
        <div class="ai-choice-btns">
          <button type="button" class="btn btn-secondary ai-choice-btn" id="pur-manual">📝 Regjistro manualisht</button>
          <button type="button" class="btn btn-ai-scan ai-choice-btn" id="pur-scan">📷 Skano Faturën e Blerjes</button>
          <button type="button" class="btn btn-ai-scan ai-choice-btn" id="pur-batch">📷 Skano Shumë</button>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" style="margin-top:16px" id="pur-choice-cancel">Anulo</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#pur-choice-cancel").onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.querySelector("#pur-manual").onclick = () => {
      overlay.remove();
      this.pendingPhoto = null;
      this.aiPrefill = null;
      this.openPurchaseForm();
    };
    overlay.querySelector("#pur-scan").onclick = () => {
      overlay.remove();
      BlerjetAiScan.open({
        onFillForm: (data, file) => this.fillFormFromAi(data, file),
      });
    };
    overlay.querySelector("#pur-batch").onclick = () => {
      overlay.remove();
      BlerjetAiScan.open({
        batch: true,
      });
    };
  },

  fillFormFromAi(data, file) {
    this.aiPrefill = data;
    if (file) {
      this.pendingPhoto = {
        base64: file.base64,
        mimeType: file.mimeType,
        previewUrl: file.previewUrl,
        name: file.name,
      };
    }
    this.openPurchaseForm(data);
  },

  itemRowHtml(it = {}, idx = 0) {
    const desc = it.description || "Mall";
    const qty = it.quantity ?? 1;
    const price = it.unit_price_with_vat ?? 118;
    const vat = it.vat_rate ?? 18;
    const unit = it.unit || "copë";
    return `
      <div class="form-grid pur-line" data-idx="${idx}">
        <div class="form-group"><label>Artikulli</label><input class="p-desc" value="${desc.replace(/"/g, "&quot;")}"></div>
        <div class="form-group"><label>Njësia</label><input class="p-unit" value="${unit.replace(/"/g, "&quot;")}"></div>
        <div class="form-group"><label>Sasia</label><input type="number" class="p-qty" value="${qty}" min="0.001" step="any"></div>
        <div class="form-group"><label>Çmimi me TVSH</label><input type="number" class="p-price" value="${price}" min="0" step="0.01"></div>
        <div class="form-group"><label>TVSH %</label><select class="p-vat">
          <option value="18" ${vat === 18 ? "selected" : ""}>18%</option>
          <option value="8" ${vat === 8 ? "selected" : ""}>8%</option>
          <option value="0" ${vat === 0 ? "selected" : ""}>0%</option>
        </select></div>
        <div class="form-group" style="align-self:end"><button type="button" class="btn btn-sm btn-danger del-pur-line" ${idx === 0 ? "disabled" : ""}>✕</button></div>
      </div>`;
  },

  openPurchaseForm(prefill) {
    const form = document.getElementById("pur-form");
    if (!form) return;
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth", block: "start" });

    const d = prefill || this.aiPrefill || {};
    if (d.supplier_invoice_number) document.getElementById("p_num").value = d.supplier_invoice_number;
    if (d.invoice_date) document.getElementById("p_date").value = d.invoice_date;
    if (d.supplier_name) document.getElementById("p_sup").value = d.supplier_name;
    if (d.supplier_nui) document.getElementById("p_nui").value = d.supplier_nui;
    if (d.supplier_fiscal) document.getElementById("p_fiscal").value = d.supplier_fiscal;
    if (d.payment_method) document.getElementById("p_pay").value = d.payment_method;

    const itemsEl = document.getElementById("pur-items");
    const items = d.items?.length ? d.items : [{ description: "Mall", quantity: 1, unit_price_with_vat: 118, vat_rate: 18, unit: "copë" }];
    itemsEl.innerHTML = items.map((it, i) => this.itemRowHtml(it, i)).join("");
    this.bindItemRows();

    const photoEl = document.getElementById("pur-photo-preview");
    if (this.pendingPhoto?.previewUrl) {
      photoEl.innerHTML = `<img src="${this.pendingPhoto.previewUrl}" alt="Foto fature"><span>${this.pendingPhoto.name || "Foto e skanuar"}</span>`;
      photoEl.style.display = "flex";
    } else {
      photoEl.innerHTML = "";
      photoEl.style.display = "none";
    }
    this.aiPrefill = null;
  },

  bindItemRows() {
    document.querySelectorAll(".del-pur-line").forEach((btn) => {
      btn.onclick = () => {
        const rows = document.querySelectorAll("#pur-items .pur-line");
        if (rows.length <= 1) return;
        btn.closest(".pur-line")?.remove();
      };
    });
  },

  collectFormItems() {
    return Array.from(document.querySelectorAll("#pur-items .pur-line")).map((line) => ({
      description: line.querySelector(".p-desc").value,
      unit: line.querySelector(".p-unit").value || "copë",
      quantity: Number(line.querySelector(".p-qty").value),
      unit_price_with_vat: Number(line.querySelector(".p-price").value),
      vat_rate: Number(line.querySelector(".p-vat").value),
    }));
  },

  buildSaveBody() {
    const body = {
      supplier_invoice_number: document.getElementById("p_num").value,
      invoice_date: document.getElementById("p_date").value,
      supplier_name: document.getElementById("p_sup").value,
      supplier_nui: document.getElementById("p_nui").value,
      supplier_fiscal: document.getElementById("p_fiscal").value,
      payment_method: document.getElementById("p_pay").value,
      items: this.collectFormItems(),
    };
    if (this.pendingPhoto?.base64) {
      body.photo_attachment = {
        base64: this.pendingPhoto.base64,
        mimeType: this.pendingPhoto.mimeType || "image/jpeg",
      };
    }
    return body;
  },

  async saveFromAi(data, file) {
    if (file) {
      this.pendingPhoto = {
        base64: file.base64,
        mimeType: file.mimeType,
        previewUrl: file.previewUrl,
        name: file.name,
      };
    }
    const body = {
      supplier_invoice_number: data.supplier_invoice_number || "",
      invoice_date: data.invoice_date || new Date().toISOString().slice(0, 10),
      supplier_name: data.supplier_name || "",
      supplier_nui: data.supplier_nui || "",
      supplier_fiscal: data.supplier_fiscal || "",
      payment_method: data.payment_method || "cash",
      items: data.items || [],
    };
    if (this.pendingPhoto?.base64) {
      body.photo_attachment = {
        base64: this.pendingPhoto.base64,
        mimeType: this.pendingPhoto.mimeType,
      };
    }
    await KAPI.api("/purchase-invoices", { method: "POST", body });
    this.pendingPhoto = null;
  },

  async showPurchaseDetail(id) {
    const [{ invoice, items, has_photo }, settingsRes] = await Promise.all([
      KAPI.api("/purchase-invoices/" + id),
      KAPI.api("/settings"),
    ]);
    const s = settingsRes.settings || {};
    const bodyHtml = `<p><strong>Data:</strong> ${KAPI.fmtDate(invoice.invoice_date)} · <strong>Furnitori:</strong> ${invoice.supplier_name}<br>
      <strong>NUI:</strong> ${invoice.supplier_nui || "—"} · <strong>Nr. Fiskal:</strong> ${invoice.supplier_fiscal || "—"}</p>
      <table><thead><tr><th>Artikulli</th><th>Sasia</th><th>Çmimi</th><th>TVSH</th></tr></thead><tbody>${items.map((it) =>
        `<tr><td>${it.description}</td><td>${it.quantity}</td><td style="text-align:right">${KAPI.fmt(it.unit_price_with_vat)}</td><td>${it.vat_rate}%</td></tr>`
      ).join("")}</tbody>
      <tfoot><tr><td colspan="3"><strong>Totali</strong></td><td style="text-align:right"><strong>${KAPI.fmt(invoice.grand_total)} €</strong></td></tr></tfoot></table>`;
    const title = `Faturë blerjeje ${invoice.internal_number || invoice.invoice_number || ""}`;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px">
        <h2>Faturë blerjeje ${invoice.internal_number || invoice.invoice_number || ""}</h2>
        <div class="form-grid" style="margin:16px 0">
          <div><strong>Data:</strong> ${KAPI.fmtDate(invoice.invoice_date)}</div>
          <div><strong>Furnitori:</strong> ${invoice.supplier_name}</div>
          <div><strong>NUI:</strong> ${invoice.supplier_nui || "—"}</div>
          <div><strong>Totali:</strong> ${KAPI.fmt(invoice.grand_total)} €</div>
        </div>
        <ul style="margin:0 0 16px;padding-left:20px;color:var(--text-secondary)">
          ${items.map((it) => `<li>${it.description} — ${it.quantity} × ${KAPI.fmt(it.unit_price_with_vat)} (${it.vat_rate}%)</li>`).join("")}
        </ul>
        ${has_photo ? `<a class="btn btn-secondary" href="/api/purchase-invoices/${id}/photo" target="_blank" rel="noopener">📷 Shiko foton origjinale</a>` : "<p style=\"color:var(--text-secondary)\">Pa foto të bashkangjitur</p>"}
        <div class="toolbar" style="margin-top:16px">
          <button type="button" class="btn btn-print" id="pur-print">🖨 Printo</button>
          <button type="button" class="btn btn-sm btn-secondary" id="pur-detail-close">Mbyll</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#pur-print").onclick = () => {
      PdfExport.printHtmlSync(title, bodyHtml, s, invoice.invoice_date, invoice.invoice_date);
    };
    overlay.querySelector("#pur-detail-close").onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  },

  async renderPurchases() {
    const el = document.getElementById("blerjet-content");
    const [data, purNum] = await Promise.all([
      KAPI.api("/purchase-invoices"),
      KAPI.api("/next-purchase-number"),
    ]);
    const suppliers = new Set(data.rows.map((r) => r.supplier_name)).size;

    el.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi-card"><div class="label">Fatura</div><div class="value">${data.rows.length}</div></div>
        <div class="kpi-card"><div class="label">Blerje totale</div><div class="value">${KAPI.fmt(data.rows.reduce((a, r) => a + r.grand_total, 0))} €</div></div>
        <div class="kpi-card"><div class="label">Furnizues</div><div class="value">${suppliers}</div></div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="add-pur">+ Faturë e re</button>
        ${CsvExport.toolbar({ print: false, pdf: false })}
      </div>
      <div class="card" id="pur-form" style="display:none">
        <h3>Faturë blerjeje</h3>
        <div id="pur-photo-preview" class="pur-photo-preview" style="display:none"></div>
        <div class="form-grid">
          <div class="form-group"><label>BL (automatik)</label><input id="p_internal" value="${purNum.number}" readonly></div>
          <div class="form-group"><label>Nr. faturës furnitori *</label><input id="p_num"></div>
          <div class="form-group"><label>Data *</label><input type="date" id="p_date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="form-group"><label>Furnitori *</label><input id="p_sup"></div>
          <div class="form-group"><label>NUI furnitori * ${KAPI.fieldTip("Numri Unik Identifikues i furnitorit — pa NUI valid nuk llogaritet TVSH e zbritshme")}</label><input id="p_nui" maxlength="9"></div>
          <div class="form-group"><label>Nr. Fiskal *</label><input id="p_fiscal"></div>
          <div class="form-group"><label>Pagesa</label><select id="p_pay"><option value="cash">Para në dorë</option><option value="card">Kartë</option><option value="transfer">Transfer bankar</option></select></div>
        </div>
        <div id="pur-items">${this.itemRowHtml({}, 0)}</div>
        <button type="button" class="btn btn-sm btn-secondary" id="add-pur-line" style="margin-top:8px">+ Shto artikull</button>
        <div class="toolbar" style="margin-top:16px">
          <button class="btn btn-primary" id="save-pur">Ruaj</button>
          <button class="btn btn-secondary" id="cancel-pur">Anulo</button>
        </div>
      </div>
      <div class="card"><table class="data-table"><thead><tr>
        <th>Data</th><th>Nr.</th><th>Furnitori</th><th>Pa TVSH</th><th>TVSH</th><th>Totali</th><th></th>
      </tr></thead><tbody>${data.rows.map((r) => `<tr>
        <td>${KAPI.fmtDate(r.invoice_date)}</td><td>${r.invoice_number || r.internal_number || "—"}</td><td>${r.supplier_name}</td>
        <td>${KAPI.fmt(r.subtotal)}</td><td>${KAPI.fmt(r.vat_total)}</td><td>${KAPI.fmt(r.grand_total)} €</td>
        <td class="table-actions">
          ${this.photoBtn("pur", r.id, r.photo_path)}
          <button class="btn btn-sm btn-secondary view-pur" data-id="${r.id}">Detaje</button>
          <button class="btn btn-sm btn-danger del-pur" data-id="${r.id}">Fshi</button>
        </td>
      </tr>`).join("") || "<tr><td colspan=\"7\">Pa fatura blerjeje</td></tr>"}</tbody></table></div>`;

    el.querySelector("[data-action='csv']")?.addEventListener("click", () => {
      const CE = CsvExport;
      const headers = ["Nr. Faturës", "Data", "Furnitori", "NUI", "Nr. Fiskal", "Baza pa TVSH", "TVSH 18%", "TVSH 8%", "Totali", "Statusi"];
      const csvRows = data.rows.map((r) => [
        r.invoice_number || r.internal_number || "", CE.fmtDate(r.invoice_date), r.supplier_name || "",
        r.supplier_nui || "", r.supplier_fiscal || "",
        CE.fmtNum(r.subtotal), CE.fmtNum(r.vat_18), CE.fmtNum(r.vat_8), CE.fmtNum(r.grand_total), r.status || "active",
      ]);
      if (data.rows.length) {
        csvRows.push(["TOTALI", "", "", "", "",
          CE.fmtNum(data.rows.reduce((a, r) => a + (r.subtotal || 0), 0)),
          CE.fmtNum(data.rows.reduce((a, r) => a + (r.vat_18 || 0), 0)),
          CE.fmtNum(data.rows.reduce((a, r) => a + (r.vat_8 || 0), 0)),
          CE.fmtNum(data.rows.reduce((a, r) => a + (r.grand_total || 0), 0)), ""]);
      }
      CE.save(`blerjet_${CE.monthSuffix(new Date().toISOString().slice(0, 10))}.csv`, headers, csvRows);
    });

    document.getElementById("add-pur").onclick = () => this.showNewInvoiceChoice();
    document.getElementById("cancel-pur").onclick = () => {
      document.getElementById("pur-form").style.display = "none";
      this.pendingPhoto = null;
    };
    this.bindItemRows();
    document.getElementById("add-pur-line").onclick = () => {
      const itemsEl = document.getElementById("pur-items");
      const idx = itemsEl.querySelectorAll(".pur-line").length;
      itemsEl.insertAdjacentHTML("beforeend", this.itemRowHtml({}, idx));
      this.bindItemRows();
    };
    document.getElementById("save-pur").onclick = async () => {
      try {
        await KAPI.api("/purchase-invoices", { method: "POST", body: this.buildSaveBody() });
        KAPI.toast("Blerja u ruajt — TVSH hyrëse u përditësua");
        this.pendingPhoto = null;
        KAPI.emitDataChanged();
      } catch (e) { KAPI.toast(e.message, true); }
    };
    el.querySelectorAll(".del-pur").forEach((b) => {
      b.onclick = async () => {
        await KAPI.api("/purchase-invoices/" + b.dataset.id, { method: "DELETE" });
        KAPI.toast("Blerja u fshi");
        KAPI.emitDataChanged();
      };
    });
    el.querySelectorAll(".view-pur").forEach((b) => {
      b.onclick = () => this.showPurchaseDetail(b.dataset.id);
    });
    this.bindPhotoButtons(el);
  },

  async renderExpenses() {
    const el = document.getElementById("blerjet-content");
    const data = await KAPI.api("/expenses");
    const total = data.rows.reduce((a, r) => a + Number(r.amount || 0), 0);
    const vatIn = data.rows.reduce((a, r) => a + Number(r.vat_amount || 0), 0);

    el.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi-card"><div class="label">Shpenzime</div><div class="value">${data.rows.length}</div></div>
        <div class="kpi-card"><div class="label">Totali</div><div class="value">${KAPI.fmt(total)} €</div></div>
        <div class="kpi-card"><div class="label">TVSH e zbritshme ${KAPI.fieldTip("Kjo TVSH zbritet nga TVSH e daljes në deklaratën tuaj")}</div><div class="value">${KAPI.fmt(vatIn)} €</div></div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="add-exp">+ Shpenzim i Ri</button>
        <button class="btn btn-ai-scan" id="scan-exp-ai">📷 Skano Shpenzimin</button>
        <button class="btn btn-ai-scan" id="scan-exp-batch">📷 Skano Shumë</button>
        ${CsvExport.toolbar({ print: false, pdf: false })}
      </div>
      <div class="card" id="exp-form" style="display:none">
        <h3>Shpenzim i ri</h3>
        <div class="form-grid">
          <div class="form-group"><label>Data *</label><input type="date" id="e_date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="form-group"><label>Kategoria *</label><select id="e_cat">${this.EXPENSE_CATS.map((c) => `<option>${c}</option>`).join("")}</select></div>
          <div class="form-group"><label>Përshkrimi *</label><input id="e_desc"></div>
          <div class="form-group"><label>Shuma me TVSH *</label><input type="number" id="e_amt" value="118"></div>
          <div class="form-group"><label>TVSH %</label><select id="e_vat"><option value="18">18%</option><option value="8">8%</option><option value="0">0%</option></select></div>
          <div class="form-group"><label>Furnitori</label><input id="e_sup"></div>
          <div class="form-group"><label>NUI furnitori</label><input id="e_nui" maxlength="9"></div>
          <div class="form-group"><label>Nr. Fiskal</label><input id="e_fiscal"></div>
        </div>
        <div class="toolbar"><button class="btn btn-primary" id="save-exp">Ruaj</button><button class="btn btn-secondary" id="cancel-exp">Anulo</button></div>
      </div>
      <div class="card"><table class="data-table"><thead><tr>
        <th>Data</th><th>Kategoria</th><th>Përshkrimi</th><th>Shuma</th><th>TVSH</th><th></th>
      </tr></thead><tbody>${data.rows.map((r) => `<tr>
        <td>${KAPI.fmtDate(r.expense_date)}</td><td>${r.category}</td><td>${r.description}</td>
        <td>${KAPI.fmt(r.amount)} €</td><td>${KAPI.fmt(r.vat_amount)}</td>
        <td class="table-actions">${this.photoBtn("exp", r.id, r.photo_path)}<button class="btn btn-sm btn-danger del-exp" data-id="${r.id}">Fshi</button></td>
      </tr>`).join("") || "<tr><td colspan=\"6\">Pa shpenzime</td></tr>"}</tbody></table></div>`;

    document.getElementById("add-exp").onclick = () => { document.getElementById("exp-form").style.display = "block"; };
    document.getElementById("scan-exp-ai")?.addEventListener("click", () => this.openExpenseAiScan());
    document.getElementById("scan-exp-batch")?.addEventListener("click", () => this.openExpenseAiScanBatch());
    this.bindPhotoButtons(el);
    el.querySelector("[data-action='csv']")?.addEventListener("click", () => {
      const CE = CsvExport;
      const headers = ["Data", "Kategoria", "Përshkrimi", "Shuma", "Ka TVSH", "Norma", "TVSH e zbritshme", "Nr. Dëshmie"];
      const csvRows = data.rows.map((r) => [
        CE.fmtDate(r.expense_date), r.category || "", r.description || "",
        CE.fmtNum(r.amount), (r.vat_amount || 0) > 0 ? "Po" : "Jo",
        `${r.vat_rate || 0}%`, CE.fmtNum(r.vat_amount), r.expense_number || "",
      ]);
      if (data.rows.length) {
        csvRows.push(["TOTALI", "", "", CE.fmtNum(data.rows.reduce((a, r) => a + (r.amount || 0), 0)), "", "",
          CE.fmtNum(data.rows.reduce((a, r) => a + (r.vat_amount || 0), 0)), ""]);
      }
      CE.save(`shpenzimet_${CE.monthSuffix(new Date().toISOString().slice(0, 10))}.csv`, headers, csvRows);
    });
    document.getElementById("cancel-exp").onclick = () => {
      document.getElementById("exp-form").style.display = "none";
      this.pendingExpensePhoto = null;
    };
    document.getElementById("save-exp").onclick = async () => {
      try {
        const vatRate = Number(document.getElementById("e_vat").value);
        const body = {
          expense_date: document.getElementById("e_date").value,
          category: document.getElementById("e_cat").value,
          description: document.getElementById("e_desc").value,
          amount: Number(document.getElementById("e_amt").value),
          has_vat: vatRate > 0,
          vat_rate: vatRate,
          supplier_name: document.getElementById("e_sup").value,
          supplier_nui: document.getElementById("e_nui").value,
          supplier_fiscal: document.getElementById("e_fiscal").value,
        };
        if (this.pendingExpensePhoto?.base64) {
          body.photo_attachment = {
            base64: this.pendingExpensePhoto.base64,
            mimeType: this.pendingExpensePhoto.mimeType || "image/jpeg",
          };
        }
        await KAPI.api("/expenses", { method: "POST", body });
        this.pendingExpensePhoto = null;
        KAPI.toast("Shpenzimi u ruajt");
        KAPI.emitDataChanged();
      } catch (e) { KAPI.toast(e.message, true); }
    };
    el.querySelectorAll(".del-exp").forEach((b) => {
      b.onclick = async () => {
        await KAPI.api("/expenses/" + b.dataset.id, { method: "DELETE" });
        KAPI.toast("Shpenzimi u fshi");
        KAPI.emitDataChanged();
      };
    });
  },

  fillFormFromAiExpense(mapped, file) {
    if (file) {
      this.pendingExpensePhoto = {
        base64: file.base64,
        mimeType: file.mimeType,
        previewUrl: file.previewUrl,
        name: file.name,
      };
    }
    document.getElementById("exp-form").style.display = "block";
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== "") el.value = v; };
    set("e_date", mapped.expense_date || new Date().toISOString().slice(0, 10));
    if (mapped.category) set("e_cat", mapped.category);
    set("e_desc", mapped.description || "");
    if (mapped.amount != null) set("e_amt", mapped.amount);
    if (mapped.vat_rate != null) set("e_vat", String(mapped.vat_rate));
    set("e_sup", mapped.supplier_name || "");
    set("e_nui", mapped.supplier_nui || "");
    set("e_fiscal", mapped.supplier_fiscal || "");
  },

  openExpenseAiScan() {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({
      scanType: "expense",
      onFillForm: (mapped, file) => this.fillFormFromAiExpense(mapped, file),
    });
  },

  openExpenseAiScanBatch() {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({ scanType: "expense", batch: true });
  },

  payStatusLabel(status) {
    return this.PAY_STATUS_LABELS[status] || status || "—";
  },

  payStatusClass(status) {
    if (status === "paid") return "pay-st-paid";
    if (status === "partial") return "pay-st-partial";
    return "pay-st-unpaid";
  },

  async renderPayments() {
    const el = document.getElementById("blerjet-content");
    const data = await KAPI.api("/purchase-invoices");
    const rows = data.rows || [];
    const totalPurch = rows.reduce((a, r) => a + Number(r.grand_total || 0), 0);
    const totalPaid = rows.reduce((a, r) => a + Number(r.amount_paid || 0), 0);
    const totalDebt = rows.reduce((a, r) => a + Number(r.debt || 0), 0);

    el.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi-card"><div class="label">Totali i blerjeve</div><div class="value">${KAPI.fmt(totalPurch)} €</div></div>
        <div class="kpi-card"><div class="label">Paguar</div><div class="value">${KAPI.fmt(totalPaid)} €</div></div>
        <div class="kpi-card"><div class="label">Borxhi i papaguar</div><div class="value">${KAPI.fmt(totalDebt)} €</div></div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="add-payment">+ Regjistro Pagesë</button>
      </div>
      <div class="card"><table class="data-table"><thead><tr>
        <th>Nr.</th><th>Furnitori</th><th>Totali</th><th>Paguar</th><th>Borxhi</th><th>Statusi</th><th></th>
      </tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>
        <td>${r.internal_number || r.invoice_number || "—"}</td>
        <td>${r.supplier_name}</td>
        <td>${KAPI.fmt(r.grand_total)} €</td>
        <td>${KAPI.fmt(r.amount_paid || 0)} €</td>
        <td>${KAPI.fmt(r.debt || 0)} €</td>
        <td><span class="pay-status ${this.payStatusClass(r.payment_status)}">${this.payStatusLabel(r.payment_status)}</span></td>
        <td class="table-actions">${(r.debt || 0) > 0.01
          ? `<button type="button" class="btn btn-sm btn-primary pay-quick" data-id="${r.id}" data-debt="${r.debt}">Paguaj</button>`
          : ""}</td>
      </tr>`).join("") : '<tr><td colspan="7">Pa fatura blerjeje</td></tr>'}
      </tbody></table></div>`;

    document.getElementById("add-payment").onclick = () => this.openPaymentDialog(rows.filter((r) => (r.debt || 0) > 0.01));
    el.querySelectorAll(".pay-quick").forEach((btn) => {
      btn.onclick = () => {
        const inv = rows.find((r) => String(r.id) === btn.dataset.id);
        if (inv) this.openPaymentDialog([inv], inv);
      };
    });
  },

  openPaymentDialog(invoices, preselect = null) {
    if (!invoices.length) return KAPI.toast("Nuk ka blerje me borxh", true);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const opts = invoices.map((r) => {
      const nr = r.internal_number || r.invoice_number || `#${r.id}`;
      return `<option value="${r.id}" data-debt="${r.debt}" ${preselect?.id === r.id ? "selected" : ""}>${nr} — ${r.supplier_name} (borxh ${KAPI.fmt(r.debt)} €)</option>`;
    }).join("");
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <h2>Regjistro pagesë</h2>
        <div class="form-grid">
          <div class="form-group full-width"><label>Fatura e blerjes *</label>
            <select id="pay-inv">${opts}</select></div>
          <div class="form-group"><label>Shuma (€) *</label>
            <input type="number" id="pay-amt" min="0.01" step="0.01" value="${preselect ? Number(preselect.debt).toFixed(2) : ""}"></div>
          <div class="form-group"><label>Data *</label>
            <input type="date" id="pay-date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="form-group"><label>Metoda *</label>
            <select id="pay-method">
              <option value="cash">Para në dorë</option>
              <option value="card">Kartë</option>
              <option value="transfer">Transfer bankar</option>
            </select></div>
          <div class="form-group full-width"><label>Shënim</label>
            <input type="text" id="pay-note" placeholder="Opsional"></div>
        </div>
        <div class="toolbar" style="margin-top:16px">
          <button type="button" class="btn btn-primary" id="pay-save">Ruaj</button>
          <button type="button" class="btn btn-secondary" id="pay-cancel">Anulo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const syncAmt = () => {
      const sel = overlay.querySelector("#pay-inv");
      const opt = sel.options[sel.selectedIndex];
      const debt = Number(opt?.dataset.debt || 0);
      const inp = overlay.querySelector("#pay-amt");
      if (!inp.value || Number(inp.value) > debt) inp.value = debt > 0 ? Number(debt).toFixed(2) : "";
    };
    overlay.querySelector("#pay-inv").onchange = syncAmt;
    syncAmt();
    overlay.querySelector("#pay-cancel").onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.querySelector("#pay-save").onclick = async () => {
      try {
        const sel = overlay.querySelector("#pay-inv");
        await KAPI.api("/purchase-payments", {
          method: "POST",
          body: {
            purchase_invoice_id: Number(sel.value),
            amount: Number(overlay.querySelector("#pay-amt").value),
            payment_method: overlay.querySelector("#pay-method").value,
            payment_date: overlay.querySelector("#pay-date").value,
            note: overlay.querySelector("#pay-note").value,
          },
        });
        KAPI.toast("Pagesa u regjistrua");
        overlay.remove();
        KAPI.emitDataChanged();
      } catch (e) {
        KAPI.toast(e.message, true);
      }
    };
  },

  async saveExpenseFromAi(mapped, file) {
    const vatRate = Number(mapped.vat_rate) || 0;
    const body = {
      expense_date: mapped.expense_date || new Date().toISOString().slice(0, 10),
      category: mapped.category || "Tjera",
      description: mapped.description || "Shpenzim",
      amount: Number(mapped.amount) || 0,
      has_vat: vatRate > 0,
      vat_rate: vatRate,
      supplier_name: mapped.supplier_name || "",
      receipt_number: mapped.receipt_number || mapped.description || "AI-Skan",
    };
    if (file?.base64) {
      body.photo_attachment = { base64: file.base64, mimeType: file.mimeType || "image/jpeg" };
    }
    return KAPI.api("/expenses", { method: "POST", body });
  },
};

window.BlerjetApp = BlerjetApp;
