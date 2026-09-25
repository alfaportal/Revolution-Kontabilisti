/** Shitjet — Z-Raportet ditore (B2C) + Faturat B2B */
const ShitjetApp = {
  tab: "z",
  periodFrom: "",
  periodTo: "",
  b2bStatusFilter: "",
  b2bPayFilter: "",
  b2bSearch: "",
  editingId: null,
  pendingZPhoto: null,
  pendingB2BPhoto: null,

  monthBounds() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    return {
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    };
  },

  calcVat(gross, ratePct) {
    const g = Number(gross) || 0;
    const rate = Number(ratePct) / 100;
    if (g <= 0 || rate <= 0) return { base: Math.round(g * 100) / 100, vat: 0, gross: Math.round(g * 100) / 100 };
    const base = Math.round((g / (1 + rate)) * 100) / 100;
    const vat = Math.round((g - base) * 100) / 100;
    return { base, vat, gross: Math.round(g * 100) / 100 };
  },

  sumRows(rows, fn) {
    return Math.round(rows.reduce((a, r) => a + fn(r), 0) * 100) / 100;
  },

  tip(text) {
    return KAPI.fieldTip(text);
  },

  guideHtml() {
    return `
      <div class="card shitje-guide">
        <h3>ℹ️ SI TË REGJISTRONI SHITJET</h3>
        <div class="shitje-guide-cols">
          <div>
            <strong>📊 Z-Raporti Ditor (B2C)</strong>
            <p>Për shitjet me kupon fiskal te konsumatorët. Regjistroni <strong>vetëm totalin ditor</strong> nga kasa fiskale. Nuk ka nevojë me regjistru çdo kupon veç e veç.</p>
          </div>
          <div>
            <strong>📄 Faturat B2B (Biznes me Biznes)</strong>
            <p>Kur i shisni një biznesi tjetër me faturë. Regjistroni <strong>çdo faturë veç e veç</strong> me emrin dhe NUI-n e blerësit. Kjo kërkohet nga ATK për TVSH.</p>
          </div>
        </div>
      </div>`;
  },

  monthLabel(fromIso) {
    const months = ["Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor", "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor"];
    const [y, m] = (fromIso || "").split("-").map(Number);
    return months[m - 1] ? `${months[m - 1]} ${y}` : fromIso;
  },

  invoicePeriodWarning(dateStr) {
    if (!dateStr || !this.periodFrom || !this.periodTo) return null;
    if (dateStr >= this.periodFrom && dateStr <= this.periodTo) return null;
    const invMonth = dateStr.slice(0, 7) + "-01";
    return `⚠️ Data e faturës (${KAPI.fmtDate(dateStr)}) është jashtë periudhës aktuale (${this.monthLabel(this.periodFrom)}). Kjo faturë do të hyjë te ${this.monthLabel(invMonth)}, jo te ${this.monthLabel(this.periodFrom)}.`;
  },

  zReportGrandTotal() {
    const g18 = Number(document.getElementById("z_18")?.value) || 0;
    const g8 = Number(document.getElementById("z_8")?.value) || 0;
    const g0 = Number(document.getElementById("z_0")?.value) || 0;
    return Math.round((g18 + g8 + g0) * 100) / 100;
  },

  async fillFormFromAi(mapped, file) {
    if (file) {
      this.pendingB2BPhoto = {
        base64: file.base64,
        mimeType: file.mimeType,
        previewUrl: file.previewUrl,
        name: file.name,
      };
    }
    await this.openB2BForm(null);
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    if (mapped.invoice_number) set("inv_num", mapped.invoice_number);
    set("inv_date", mapped.invoice_date || new Date().toISOString().slice(0, 10));
    set("inv_client", mapped.client_name || "");
    set("inv_nui", mapped.client_nui || "");
    set("inv_fiscal", mapped.client_fiscal || "");
    const pm = mapped.payment_method || "transfer";
    document.querySelector(`input[name="inv_pay_method"][value="${pm}"]`)?.click();
    const box = document.getElementById("inv-items");
    if (box && mapped.items?.length) {
      box.innerHTML = mapped.items.map((it, i) => B2BInvoice.itemRowHtml(it, i)).join("");
    }
    B2BInvoice.updateTotalsPreview(box, document.getElementById("b2b-totals-preview"), document.getElementById("inv_paid"));
  },

  fillFormFromAiZ(mapped, file) {
    if (file) {
      this.pendingZPhoto = {
        base64: file.base64,
        mimeType: file.mimeType,
        previewUrl: file.previewUrl,
        name: file.name,
      };
    }
    document.getElementById("z-form").style.display = "block";
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== "") el.value = v; };
    set("z_date", mapped.report_date || new Date().toISOString().slice(0, 10));
    if (mapped.report_number) set("z_num", mapped.report_number);
    set("z_device", mapped.fiscal_device || "");
    set("z_18", mapped.sales_18_total ?? 0);
    set("z_8", mapped.sales_8_total ?? 0);
    set("z_0", mapped.sales_0_total ?? 0);
    this.bindZPreview();
  },

  openB2BAiScan() {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({
      scanType: "b2b_sales",
      onFillForm: (mapped, file) => this.fillFormFromAi(mapped, file),
    });
  },

  openB2BAiScanBatch() {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({ scanType: "b2b_sales", batch: true });
  },

  openZAiScan() {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({
      scanType: "z_report",
      onFillForm: (mapped, file) => this.fillFormFromAiZ(mapped, file),
    });
  },

  openZAiScanBatch() {
    if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
    AiScan.open({ scanType: "z_report", batch: true });
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
          z: `/api/z-reports/${id}/photo`,
          b2b: `/api/sales-invoices/${id}/photo`,
          pur: `/api/purchase-invoices/${id}/photo`,
          exp: `/api/expenses/${id}/photo`,
        };
        KAPI.showPhotoModal(paths[kind] || "", "Foto origjinale");
      };
    });
  },

  async saveZFromAi(mapped, file, replace = false) {
    const body = {
      report_date: mapped.report_date || new Date().toISOString().slice(0, 10),
      device_name: mapped.fiscal_device || "",
      sales_18_total: Number(mapped.sales_18_total) || 0,
      sales_8_total: Number(mapped.sales_8_total) || 0,
      sales_0_total: Number(mapped.sales_0_total) || 0,
      replace,
    };
    if (file?.base64) {
      body.photo_attachment = { base64: file.base64, mimeType: file.mimeType || "image/jpeg" };
    }
    try {
      return await KAPI.api("/z-reports", { method: "POST", body });
    } catch (e) {
      if (!replace && String(e.message).includes("Kjo datë")) {
        return this.saveZFromAi(mapped, file, true);
      }
      throw e;
    }
  },

  async saveB2BFromAi(mapped, file) {
    const body = {
      invoice_date: mapped.invoice_date || new Date().toISOString().slice(0, 10),
      client_name: mapped.client_name || "Klient AI",
      client_nui: mapped.client_nui || "",
      client_fiscal: mapped.client_fiscal || "",
      client_address: mapped.client_address || (mapped.client_nui ? "—" : ""),
      payment_method: mapped.payment_method || "transfer",
      items: (mapped.items || []).map((it) => ({
        description: it.description,
        unit: it.unit || "copë",
        quantity: it.quantity,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
      })),
      status: "draft",
    };
    if (file?.base64) {
      body.photo_attachment = { base64: file.base64, mimeType: file.mimeType || "image/jpeg" };
    }
    return KAPI.api("/sales-invoices", { method: "POST", body });
  },

  exportZCsv(rows) {
    const CE = CsvExport;
    const headers = ["Data", "Nr. Z-Raport", "Shitje 18% (Total)", "Baza 18%", "TVSH 18%", "Shitje 8% (Total)", "Baza 8%", "TVSH 8%", "Shitje 0%", "Totali"];
    const data = (rows || []).map((r) => [
      CE.fmtDate(r.report_date), r.report_number || "",
      CE.fmtNum(r.sales_18_total), CE.fmtNum(r.sales_18_base), CE.fmtNum(r.sales_18_vat),
      CE.fmtNum(r.sales_8_total), CE.fmtNum(r.sales_8_base), CE.fmtNum(r.sales_8_vat),
      CE.fmtNum(r.sales_0_total), CE.fmtNum(r.grand_total),
    ]);
    if (rows?.length) {
      data.push([
        "TOTALI", "",
        CE.fmtNum(this.sumRows(rows, (r) => r.sales_18_total || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.sales_18_base || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.sales_18_vat || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.sales_8_total || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.sales_8_base || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.sales_8_vat || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.sales_0_total || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.grand_total || 0)),
      ]);
    }
    CE.save(`z-raportet_${CE.monthSuffix(this.periodFrom)}.csv`, headers, data);
  },

  exportB2BCsv(rows) {
    const CE = CsvExport;
    const headers = ["Nr. Faturës", "Data", "Klienti", "NUI", "Nr. Fiskal", "Baza pa TVSH", "TVSH 18%", "TVSH 8%", "Totali", "Pagesa", "Statusi"];
    const data = (rows || []).map((r) => [
      r.invoice_number || "", CE.fmtDate(r.invoice_date), r.client_name || "", r.client_nui || "", r.client_fiscal || "",
      CE.fmtNum(r.subtotal), CE.fmtNum(r.vat_18), CE.fmtNum(r.vat_8), CE.fmtNum(r.grand_total),
      r.payment_method || "", r.status || "",
    ]);
    if (rows?.length) {
      data.push(["TOTALI", "", "", "", "",
        CE.fmtNum(this.sumRows(rows, (r) => r.subtotal || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.vat_18 || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.vat_8 || 0)),
        CE.fmtNum(this.sumRows(rows, (r) => r.grand_total || 0)), "", ""]);
    }
    CE.save(`faturat-b2b_${CE.monthSuffix(this.periodFrom)}.csv`, headers, data);
  },

  async init() {
    if (!this.periodFrom) {
      const b = this.monthBounds();
      this.periodFrom = b.from;
      this.periodTo = b.to;
    }

    const root = document.getElementById("module-root");
    root.innerHTML = `
      <div class="tabs">
        <button class="tab ${this.tab === "z" ? "active" : ""}" data-tab="z">📊 Z-Raportet Ditore</button>
        <button class="tab ${this.tab === "b2b" ? "active" : ""}" data-tab="b2b">📄 Faturat B2B</button>
      </div>
      <div class="card shitje-period-bar">
        <label>Periudha:</label>
        <input type="date" id="sh-from" value="${this.periodFrom}">
        <span>—</span>
        <input type="date" id="sh-to" value="${this.periodTo}">
        <button type="button" class="btn btn-sm btn-secondary" id="sh-apply">Apliko</button>
      </div>
      ${this.guideHtml()}
      <div id="shitjet-content"></div>`;

    root.querySelectorAll(".tab").forEach((t) => t.onclick = () => { this.tab = t.dataset.tab; this.init(); });
    document.getElementById("sh-apply").onclick = () => {
      this.periodFrom = document.getElementById("sh-from").value;
      this.periodTo = document.getElementById("sh-to").value;
      this.init();
    };

    if (this.tab === "z") await this.renderZ();
    else await this.renderB2B();
  },

  async fetchKpis() {
    const q = `from=${this.periodFrom}&to=${this.periodTo}`;
    const [z, inv] = await Promise.all([
      KAPI.api(`/z-reports?${q}`),
      KAPI.api(`/sales-invoices?${q}&status=finalized`),
    ]);
    const zSales = this.sumRows(z.rows, (r) => r.grand_total || 0);
    const zVat = this.sumRows(z.rows, (r) => (r.sales_18_vat || 0) + (r.sales_8_vat || 0));
    const b2bSales = this.sumRows(inv.rows, (r) => r.grand_total || 0);
    const b2bVat = this.sumRows(inv.rows, (r) => r.vat_total || 0);
    return {
      zSales,
      b2bSales,
      totalSales: zSales + b2bSales,
      totalVat: zVat + b2bVat,
      zCount: z.rows.length,
      b2bCount: inv.rows.length,
      zRows: z.rows,
      b2bRows: inv.rows,
    };
  },

  kpiHtml(kpis) {
    return `
      <div class="kpi-grid shitje-kpi-grid">
        <div class="kpi-card"><div class="label">Z-Raportet (B2C)</div><div class="value">${KAPI.fmt(kpis.zSales)} €</div></div>
        <div class="kpi-card"><div class="label">Faturat B2B</div><div class="value">${KAPI.fmt(kpis.b2bSales)} €</div></div>
        <div class="kpi-card"><div class="label">Shitjet Totale (B2C + B2B)</div><div class="value">${KAPI.fmt(kpis.totalSales)} €</div></div>
        <div class="kpi-card"><div class="label">TVSH e Daljes</div><div class="value">${KAPI.fmt(kpis.totalVat)} €</div></div>
      </div>`;
  },

  bindZPreview() {
    const update = () => {
      const g18 = Number(document.getElementById("z_18")?.value) || 0;
      const g8 = Number(document.getElementById("z_8")?.value) || 0;
      const g0 = Number(document.getElementById("z_0")?.value) || 0;
      const s18 = this.calcVat(g18, 18);
      const s8 = this.calcVat(g8, 8);
      const grand = Math.round((g18 + g8 + g0) * 100) / 100;
      const el = document.getElementById("z-preview");
      if (!el) return;
      el.innerHTML = `
        <div class="z-preview-grid">
          <div><strong>18%:</strong> Baza ${KAPI.fmt(s18.base)} € · TVSH ${KAPI.fmt(s18.vat)} €</div>
          <div><strong>8%:</strong> Baza ${KAPI.fmt(s8.base)} € · TVSH ${KAPI.fmt(s8.vat)} €</div>
          <div><strong>0%:</strong> Baza ${KAPI.fmt(g0)} € · TVSH 0.00 €</div>
          <div class="z-preview-total"><strong>Totali i ditës:</strong> ${KAPI.fmt(grand)} €</div>
        </div>`;
      const warnEl = document.getElementById("z-high-warn");
      if (warnEl) {
        if (grand >= 5000) {
          warnEl.style.display = "block";
          warnEl.innerHTML = `⚠️ Totali i Z-Raportit (€${KAPI.fmt(grand)}) është jashtëzakonisht i lartë. Sigurohuni që nuk keni përfshirë faturat B2B në këtë total — ato regjistrohen veçmas.`;
        } else {
          warnEl.style.display = "none";
          warnEl.innerHTML = "";
        }
      }
    };
    ["z_18", "z_8", "z_0"].forEach((id) => document.getElementById(id)?.addEventListener("input", update));
    update();
  },

  async saveZReport(replace = false) {
    const body = {
      report_date: document.getElementById("z_date").value,
      device_name: document.getElementById("z_device").value,
      sales_18_total: Number(document.getElementById("z_18").value),
      sales_8_total: Number(document.getElementById("z_8").value),
      sales_0_total: Number(document.getElementById("z_0").value),
      replace,
    };
    if (this.pendingZPhoto?.base64) {
      body.photo_attachment = {
        base64: this.pendingZPhoto.base64,
        mimeType: this.pendingZPhoto.mimeType || "image/jpeg",
      };
    }
    const res = await fetch("/api/z-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.duplicate) {
      if (confirm("Kjo datë tashmë ka Z-Raport. Dëshironi ta zëvendësoni?")) {
        return this.saveZReport(true);
      }
      return null;
    }
    if (!res.ok || data.ok === false) throw new Error(data.error || "Gabim ruajtje");
    this.pendingZPhoto = null;
    return data;
  },

  async renderZ() {
    const el = document.getElementById("shitjet-content");
    const kpis = await this.fetchKpis();
    const rows = kpis.zRows;
    const t18 = this.sumRows(rows, (r) => r.sales_18_total || 0);
    const t8 = this.sumRows(rows, (r) => r.sales_8_total || 0);
    const t0 = this.sumRows(rows, (r) => r.sales_0_total || 0);
    const tAll = this.sumRows(rows, (r) => r.grand_total || 0);

    el.innerHTML = `
      ${this.kpiHtml(kpis)}
      <div class="toolbar">
        <button class="btn btn-primary" id="add-z">+ Regjistro Z-Raport</button>
        <button class="btn btn-ai-scan" id="scan-z-ai">📷 Skano Z-Raportin</button>
        <button class="btn btn-ai-scan" id="scan-z-batch">📷 Skano Shumë</button>
        ${CsvExport.toolbar({ print: false, pdf: false })}
      </div>
      <p class="hint shitje-tab-help">Regjistroni totalin e shitjeve ditore nga raporti Z i kasës fiskale. Ky raport mbulon krejt shitjet B2C (me kupon fiskal). Faturat B2B regjistrohen veçmas te tab-i <strong>Faturat B2B</strong>.</p>
      <div class="card" id="z-form" style="display:none">
        <h3>Regjistro Z-Raport</h3>
        <div class="alert-inline alert-warn">
          ⚠️ Kujdes: Totalin e Z-Raportit futeni <strong>PA faturat B2B</strong>.
          Faturat B2B regjistrohen veçmas te tab-i Faturat B2B.
          Nëse i futni edhe B2B-të në Z-Raport, TVSH llogaritet dy herë!
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Data *</label><input type="date" id="z_date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="form-group"><label>Nr. i Z-Raportit</label><input id="z_num" readonly placeholder="Z-0001"></div>
          <div class="form-group"><label>Pajisja fiskale</label><input id="z_device" placeholder="Revolution POS"></div>
          <div class="form-group"><label>Shitje 18% — Totali me TVSH (€) * ${this.tip("Totali me TVSH i produkteve me normë 18% nga raporti Z")}</label><input type="number" step="0.01" min="0" id="z_18" value="0"></div>
          <div class="form-group"><label>Shitje 8% — Totali me TVSH (€) ${this.tip("Totali me TVSH i produkteve me normë 8% (bukë, miell, ilaçe etj.)")}</label><input type="number" step="0.01" min="0" id="z_8" value="0"></div>
          <div class="form-group"><label>Shitje 0% — Totali (€) ${this.tip("Totali i shitjeve të përjashtuara nga TVSH")}</label><input type="number" step="0.01" min="0" id="z_0" value="0"></div>
        </div>
        <div id="z-high-warn" class="alert-inline alert-warn" style="display:none"></div>
        <div id="z-preview" class="z-preview-box"></div>
        <div class="toolbar"><button class="btn btn-primary" id="save-z">Ruaj Z-Raport</button><button class="btn btn-secondary" id="cancel-z">Anulo</button></div>
      </div>
      <div class="card"><table class="data-table"><thead><tr>
        <th>Data</th><th>Nr. Z-Raport</th><th>Shitje 18%</th><th>Shitje 8%</th><th>Shitje 0%</th><th>Totali</th><th></th>
      </tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>
        <td>${KAPI.fmtDate(r.report_date)}</td>
        <td>${r.report_number || "—"}</td>
        <td>${KAPI.fmt(r.sales_18_total)}</td>
        <td>${KAPI.fmt(r.sales_8_total)}</td>
        <td>${KAPI.fmt(r.sales_0_total)}</td>
        <td><strong>${KAPI.fmt(r.grand_total)} €</strong></td>
        <td class="table-actions">${this.photoBtn("z", r.id, r.photo_path)}<button class="btn btn-sm btn-danger del-z" data-id="${r.id}">Anulo</button></td>
      </tr>`).join("") : '<tr><td colspan="7" class="empty-state">Pa Z-Raporte për këtë periudhë</td></tr>'}
      ${rows.length ? `<tr class="table-total-row"><td colspan="2"><strong>TOTALI</strong></td>
        <td><strong>${KAPI.fmt(t18)}</strong></td><td><strong>${KAPI.fmt(t8)}</strong></td>
        <td><strong>${KAPI.fmt(t0)}</strong></td><td><strong>${KAPI.fmt(tAll)} €</strong></td><td></td></tr>` : ""}
      </tbody></table></div>`;

    document.getElementById("add-z").onclick = async () => {
      document.getElementById("z-form").style.display = "block";
      try {
        const r = await KAPI.api("/next-z-report-number");
        document.getElementById("z_num").value = r.number || "";
      } catch {
        document.getElementById("z_num").value = "";
      }
      this.bindZPreview();
    };
    document.getElementById("scan-z-ai")?.addEventListener("click", () => this.openZAiScan());
    document.getElementById("scan-z-batch")?.addEventListener("click", () => this.openZAiScanBatch());
    this.bindPhotoButtons(el);
    el.querySelector("[data-action='csv']")?.addEventListener("click", () => this.exportZCsv(rows));
    document.getElementById("cancel-z").onclick = () => { document.getElementById("z-form").style.display = "none"; };
    document.getElementById("save-z").onclick = async () => {
      try {
        const grand = this.zReportGrandTotal();
        if (grand >= 5000) {
          const ok = confirm(`Totali i Z-Raportit është €${KAPI.fmt(grand)} — jeni të sigurt që nuk keni përfshirë faturat B2B?\n\nFaturat B2B regjistrohen veçmas; përndryshe TVSH llogaritet dy herë.`);
          if (!ok) return;
        }
        const data = await this.saveZReport(false);
        if (!data) return;
        KAPI.toast(`Z-Raport ${data.report_number || ""} u ruajt · Totali ${KAPI.fmt(data.computed?.grand_total)} €`);
        KAPI.emitDataChanged();
      } catch (e) { KAPI.toast(e.message, true); }
    };
    el.querySelectorAll(".del-z").forEach((b) => b.onclick = async () => {
      if (!confirm("Anulo këtë Z-Raport?")) return;
      await KAPI.api("/z-reports/" + b.dataset.id, { method: "DELETE" });
      KAPI.emitDataChanged();
    });
  },

  async fetchB2BInvoices() {
    let q = `from=${this.periodFrom}&to=${this.periodTo}`;
    if (this.b2bStatusFilter) q += `&status=${encodeURIComponent(this.b2bStatusFilter)}`;
    if (this.b2bPayFilter) q += `&payment_status=${encodeURIComponent(this.b2bPayFilter)}`;
    if (this.b2bSearch?.trim()) q += `&search=${encodeURIComponent(this.b2bSearch.trim())}`;
    return KAPI.api(`/sales-invoices?${q}`);
  },

  b2bKpiHtml(rows) {
    const active = rows.filter((r) => r.status !== "cancelled");
    const finalized = rows.filter((r) => r.status === "finalized");
    const totalValue = this.sumRows(finalized, (r) => r.grand_total || 0);
    const paid = this.sumRows(finalized, (r) => r.amount_paid || 0);
    const debt = this.sumRows(finalized, (r) => Math.max(0, (r.grand_total || 0) - (r.amount_paid || 0)));
    return `
      <div class="kpi-grid shitje-kpi-grid b2b-kpi-grid">
        <div class="kpi-card"><div class="label">Faturat Totale</div><div class="value">${active.length}</div></div>
        <div class="kpi-card"><div class="label">Vlera Totale</div><div class="value">${KAPI.fmt(totalValue)} €</div></div>
        <div class="kpi-card"><div class="label">Të Paguara</div><div class="value">${KAPI.fmt(paid)} €</div></div>
        <div class="kpi-card"><div class="label">Borxhe</div><div class="value">${KAPI.fmt(debt)} €</div></div>
      </div>`;
  },

  bindB2BFormEvents() {
    const itemsEl = document.getElementById("inv-items");
    const previewEl = document.getElementById("b2b-totals-preview");
    const paidInput = document.getElementById("inv_paid");
    const refreshTotals = () => B2BInvoice.updateTotalsPreview(itemsEl, previewEl, paidInput);

    const renumber = () => {
      itemsEl.querySelectorAll(".b2b-item-row").forEach((row, i) => {
        const n = row.querySelector(".item-num");
        if (n) n.textContent = i + 1;
      });
    };

    itemsEl?.addEventListener("input", refreshTotals);
    paidInput?.addEventListener("input", refreshTotals);

    document.getElementById("add-line")?.addEventListener("click", () => {
      const idx = itemsEl.querySelectorAll(".b2b-item-row").length;
      itemsEl.insertAdjacentHTML("beforeend", B2BInvoice.itemRowHtml({}, idx));
      renumber();
      refreshTotals();
    });

    itemsEl?.addEventListener("click", (e) => {
      const btn = e.target.closest(".del-item");
      if (!btn) return;
      const rows = itemsEl.querySelectorAll(".b2b-item-row");
      if (rows.length <= 1) return KAPI.toast("Minimum 1 artikull obligativ", true);
      btn.closest(".b2b-item-row")?.remove();
      renumber();
      refreshTotals();
    });

    document.querySelectorAll('input[name="inv_pay_method"]').forEach((r) => {
      r.onchange = () => B2BInvoice.togglePaymentFields();
    });
    document.querySelectorAll('input[name="inv_pay_status"]').forEach((r) => {
      r.onchange = () => { B2BInvoice.togglePaymentFields(); refreshTotals(); };
    });

    let acTimer;
    const clientInput = document.getElementById("inv_client");
    const acList = document.getElementById("b2b-ac-list");
    clientInput?.addEventListener("input", () => {
      clearTimeout(acTimer);
      acTimer = setTimeout(async () => {
        const q = clientInput.value.trim();
        if (q.length < 2) { if (acList) acList.innerHTML = ""; return; }
        const res = await KAPI.api("/clients?q=" + encodeURIComponent(q));
        if (!acList) return;
        acList.innerHTML = (res.rows || []).map((c) =>
          `<button type="button" class="b2b-ac-item" data-nui="${c.nui}">${c.name} · NUI ${c.nui}</button>`
        ).join("");
      }, 220);
    });
    acList?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".b2b-ac-item");
      if (!btn) return;
      const res = await KAPI.api("/clients?nui=" + btn.dataset.nui);
      if (res.row) B2BInvoice.fillClientFields(res.row);
      if (acList) acList.innerHTML = "";
      refreshTotals();
    });

    document.getElementById("inv_nui")?.addEventListener("blur", async () => {
      const nui = document.getElementById("inv_nui").value.replace(/\D/g, "");
      if (!/^\d{9}$/.test(nui)) return;
      const res = await KAPI.api("/clients?nui=" + nui);
      if (res.row) B2BInvoice.fillClientFields(res.row);
    });

    refreshTotals();
    B2BInvoice.togglePaymentFields();
  },

  async openB2BForm(editId = null) {
    this.editingId = editId;
    const form = document.getElementById("inv-form");
    if (!form) return;
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth", block: "start" });

    if (editId) {
      const data = await KAPI.api("/sales-invoices/" + editId);
      B2BInvoice.populateForm(data.invoice, data.items);
      document.getElementById("inv-form-title").textContent =
        data.invoice.status === "draft" ? "Edito faturë B2B (Draft)" : "Shiko faturë B2B";
      const readOnly = data.invoice.status !== "draft";
      form.querySelectorAll("input, select, textarea, button.del-item, #add-line").forEach((el) => {
        if (el.id === "cancel-inv" || el.id === "print-inv" || el.id === "pdf-inv") return;
        el.disabled = readOnly;
      });
      document.getElementById("save-draft").style.display = readOnly ? "none" : "";
      document.getElementById("save-final").style.display = readOnly ? "none" : "";
      document.getElementById("print-inv").style.display = "";
      document.getElementById("pdf-inv").style.display = "";
    } else {
      const num = await KAPI.api("/next-invoice-number");
      B2BInvoice.populateForm({ invoice_number: num.number }, []);
      document.getElementById("inv-form-title").textContent = "Faturë B2B e re";
      form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = false; });
      document.getElementById("save-draft").style.display = "";
      document.getElementById("save-final").style.display = "";
      document.getElementById("print-inv").style.display = "none";
      document.getElementById("pdf-inv").style.display = "none";
    }
    const nui = document.getElementById("inv_nui")?.value?.replace(/\D/g, "");
    if (/^\d{9}$/.test(nui)) {
      const res = await KAPI.api("/clients?nui=" + nui);
      if (res.row) B2BInvoice.fillClientFields(res.row);
    }
    const itemsEl = document.getElementById("inv-items");
    B2BInvoice.updateTotalsPreview(itemsEl, document.getElementById("b2b-totals-preview"), document.getElementById("inv_paid"));
    B2BInvoice.togglePaymentFields();
  },

  async saveB2BInvoice(status) {
    const body = B2BInvoice.collectFormBody(status);
    if (!body.client_name) return KAPI.toast("Emri i klientit obligativ", true);
    if (!/^\d{9}$/.test(body.client_nui)) return KAPI.toast("NUI i blerësit duhet 9 shifra — OBLIGATIV për faturë B2B", true);
    if (!body.client_fiscal) return KAPI.toast("Nr. Fiskal i klientit obligativ", true);
    if (!body.client_address) return KAPI.toast("Adresa e klientit obligative", true);
    if (!body.items.length || body.items.some((it) => !it.description?.trim())) {
      return KAPI.toast("Çdo artikull duhet përshkrim", true);
    }

    const periodWarn = this.invoicePeriodWarning(body.invoice_date);
    if (periodWarn && !confirm(periodWarn + "\n\nDëshironi të vazhdoni?")) return;

    if (this.editingId) {
      const putBody = { ...body, status };
      if (this.pendingB2BPhoto?.base64) {
        putBody.photo_attachment = {
          base64: this.pendingB2BPhoto.base64,
          mimeType: this.pendingB2BPhoto.mimeType || "image/jpeg",
        };
      }
      await KAPI.api("/sales-invoices/" + this.editingId, { method: "PUT", body: putBody });
    } else {
      const postBody = { ...body, status };
      if (this.pendingB2BPhoto?.base64) {
        postBody.photo_attachment = {
          base64: this.pendingB2BPhoto.base64,
          mimeType: this.pendingB2BPhoto.mimeType || "image/jpeg",
        };
      }
      const res = await KAPI.api("/sales-invoices", { method: "POST", body: postBody });
      this.editingId = res.id;
    }
    this.pendingB2BPhoto = null;
    KAPI.toast(status === "finalized" ? "Faturë B2B u finalizua" : "Draft u ruajt");
    KAPI.emitDataChanged();
  },

  payStatusLabel(s) {
    return B2BInvoice.PAY_STATUS_LABELS[s] || s || "—";
  },

  statusLabel(s) {
    return B2BInvoice.STATUS_LABELS[s] || s;
  },

  async renderB2B() {
    const el = document.getElementById("shitjet-content");
    const [settingsRes, invRes] = await Promise.all([
      KAPI.api("/settings"),
      this.fetchB2BInvoices(),
    ]);
    const settings = settingsRes.settings || {};
    const displayRows = invRes.rows || [];
    const sellerAddr = [settings.address, settings.city, settings.municipality].filter(Boolean).join(", ");
    const finalizedRows = displayRows.filter((r) => r.status === "finalized");
    const tNet = this.sumRows(finalizedRows, (r) => r.subtotal || 0);
    const tVat = this.sumRows(finalizedRows, (r) => r.vat_total || 0);
    const tGross = this.sumRows(finalizedRows, (r) => r.grand_total || 0);

    el.innerHTML = `
      ${this.b2bKpiHtml(displayRows)}
      <div class="card b2b-filters">
        <div class="b2b-filter-row">
          <label>Statusi</label>
          <select id="b2b-f-status">
            <option value="">Të gjitha</option>
            <option value="draft" ${this.b2bStatusFilter === "draft" ? "selected" : ""}>Draft</option>
            <option value="finalized" ${this.b2bStatusFilter === "finalized" ? "selected" : ""}>Finalizuar</option>
            <option value="cancelled" ${this.b2bStatusFilter === "cancelled" ? "selected" : ""}>Anuluar</option>
          </select>
          <label>Pagesa</label>
          <select id="b2b-f-pay">
            <option value="">Të gjitha</option>
            <option value="paid" ${this.b2bPayFilter === "paid" ? "selected" : ""}>E paguar</option>
            <option value="partial" ${this.b2bPayFilter === "partial" ? "selected" : ""}>Pjesërisht</option>
            <option value="unpaid" ${this.b2bPayFilter === "unpaid" ? "selected" : ""}>E papaguar</option>
          </select>
          <label>Kërko</label>
          <input id="b2b-f-search" placeholder="Nr. faturës, klienti, NUI" value="${this.b2bSearch || ""}">
          <button type="button" class="btn btn-sm btn-secondary" id="b2b-f-apply">Filtro</button>
        </div>
      </div>
      <p class="hint shitje-tab-help">Regjistroni çdo faturë që ia lëshoni një biznesi tjetër. NUI dhe Nr. Fiskal i blerësit janë <strong>OBLIGATIVE</strong>. Këto fatura shfaqen veçmas në Librin e Shitjeve për ATK.</p>
      <div class="toolbar">
        <button class="btn btn-primary" id="add-inv">+ Faturë e Re B2B</button>
        <button class="btn btn-ai-scan" id="scan-b2b-ai">📷 Skano Faturën B2B</button>
        <button class="btn btn-ai-scan" id="scan-b2b-batch">📷 Skano Shumë</button>
        ${CsvExport.toolbar({ print: false, pdf: false })}
      </div>
      <div class="card b2b-form-card" id="inv-form" style="display:none">
        <h3 id="inv-form-title">Faturë B2B e re</h3>
        <div class="b2b-seller-header">
          <strong>${settings.business_legal_name || "—"}</strong>
          <div class="b2b-seller-meta">NUI: ${settings.nui || "—"} · Nr. Fiskal: ${settings.fiscal_number || "—"} · ARBK: ${settings.arbk || "—"}</div>
          <div class="b2b-seller-meta">${sellerAddr || "—"} · Tel: ${settings.phone || "—"} · ${settings.email || "—"}</div>
        </div>

        <h4 class="b2b-section-title">1. Numri dhe data</h4>
        <div class="form-grid">
          <div class="form-group"><label>Nr. faturës</label><input id="inv_num" readonly></div>
          <div class="form-group"><label>Data e lëshimit *</label><input type="date" id="inv_date"></div>
          <div class="form-group" id="inv-due-wrap"><label>Data e skadimit</label><input type="date" id="inv_due"></div>
          <div class="form-group"><label>Nr. porosisë</label><input id="inv_order" placeholder="Opsional"></div>
        </div>

        <h4 class="b2b-section-title">2. Klienti (biznesi blerës)</h4>
        <div class="form-grid">
          <div class="form-group b2b-ac-wrap">
            <label>Emri i biznesit *</label>
            <input id="inv_client" autocomplete="off" placeholder="Shkruani emrin ose zgjidhni nga lista">
            <div id="b2b-ac-list" class="b2b-ac-list"></div>
          </div>
          <div class="form-group"><label>NUI * ${this.tip("Numri Unik Identifikues i biznesit blerës — 9 shifra. OBLIGATIV për faturë B2B")}</label><input id="inv_nui" maxlength="9" inputmode="numeric" placeholder="9 shifra"></div>
          <div class="form-group"><label>Nr. Fiskal * ${this.tip("Numri fiskal i biznesit blerës — zakonisht i njëjtë me NUI")}</label><input id="inv_fiscal"></div>
          <div class="form-group"><label>ARBK</label><input id="inv_arbk"></div>
          <div class="form-group"><label>Nr. TVSH</label><input id="inv_vat"></div>
          <div class="form-group full-width"><label>Adresa *</label><input id="inv_addr"></div>
          <div class="form-group"><label>Qyteti</label><input id="inv_city"></div>
          <div class="form-group"><label>Telefoni</label><input id="inv_phone"></div>
          <div class="form-group"><label>Email</label><input id="inv_email" type="email"></div>
          <div class="form-group"><label>Personi kontaktues</label><input id="inv_contact"></div>
        </div>

        <h4 class="b2b-section-title">3. Artikujt</h4>
        <div id="inv-items"></div>
        <button type="button" class="btn btn-sm btn-secondary" id="add-line">+ Shto artikull</button>
        <div id="b2b-totals-preview"></div>

        <h4 class="b2b-section-title">4. Pagesa</h4>
        <div class="b2b-radio-group">
          <span class="b2b-radio-label">Mënyra:</span>
          ${["cash", "card", "transfer", "deferred"].map((v) =>
            `<label class="b2b-radio"><input type="radio" name="inv_pay_method" value="${v}" ${v === "transfer" ? "checked" : ""}> ${B2BInvoice.PAY_LABELS[v]}</label>`
          ).join("")}
        </div>
        <div class="b2b-radio-group">
          <span class="b2b-radio-label">Statusi:</span>
          ${["paid", "partial", "unpaid"].map((v) =>
            `<label class="b2b-radio"><input type="radio" name="inv_pay_status" value="${v}" ${v === "unpaid" ? "checked" : ""}> ${B2BInvoice.PAY_STATUS_LABELS[v]}</label>`
          ).join("")}
        </div>
        <div class="form-grid" id="inv-paid-wrap" style="display:none">
          <div class="form-group"><label>Shuma e paguar (€)</label><input type="number" step="0.01" min="0" id="inv_paid" value="0"></div>
        </div>

        <h4 class="b2b-section-title">5. Shënime</h4>
        <div class="form-grid">
          <div class="form-group full-width"><label>Shënime shtesë</label><textarea id="inv_notes" rows="2"></textarea></div>
          <div class="form-group full-width"><label>Kushtet e pagesës</label><textarea id="inv_terms" rows="2" placeholder="p.sh. Pagesa brenda 30 ditëve"></textarea></div>
        </div>

        <div class="toolbar b2b-form-actions">
          <button type="button" class="btn btn-secondary" id="save-draft">Ruaj Draft</button>
          <button type="button" class="btn btn-primary" id="save-final">Ruaj dhe Finalizo</button>
          <button type="button" class="btn btn-print" id="print-inv">🖨 Printo</button>
          <button type="button" class="btn btn-pdf" id="pdf-inv">📄 PDF</button>
          <button type="button" class="btn btn-secondary" id="cancel-inv">Mbyll</button>
        </div>
      </div>

      <div class="card"><table class="data-table b2b-table"><thead><tr>
        <th>Nr.</th><th>Data</th><th>Klienti</th><th>NUI</th><th>Pa TVSH</th><th>TVSH</th><th>Totali</th><th>Pagesa</th><th>Statusi</th><th>Veprime</th>
      </tr></thead><tbody>${displayRows.length ? displayRows.map((r) => `<tr class="${r.status === "cancelled" ? "row-cancelled" : ""}">
        <td>${r.invoice_number}</td>
        <td>${KAPI.fmtDate(r.invoice_date)}</td>
        <td>${r.client_name || "—"}</td>
        <td>${r.client_nui || "—"}</td>
        <td>${KAPI.fmt(r.subtotal)}</td>
        <td>${KAPI.fmt(r.vat_total)}</td>
        <td><strong>${KAPI.fmt(r.grand_total)} €</strong></td>
        <td>${this.payStatusLabel(r.payment_status)}</td>
        <td><span class="badge badge-${r.status === "finalized" ? "final" : r.status === "cancelled" ? "cancel" : "draft"}">${this.statusLabel(r.status)}</span></td>
        <td class="b2b-actions">
          <button class="btn btn-sm btn-secondary act-view" data-id="${r.id}" title="Shiko">👁</button>
          ${this.photoBtn("b2b", r.id, r.photo_path)}
          ${r.status === "draft" ? `<button class="btn btn-sm btn-primary act-edit" data-id="${r.id}" title="Edito">✏️</button>` : ""}
          ${r.status === "finalized" ? `<button class="btn btn-sm btn-print act-print" data-id="${r.id}" title="Printo">🖨</button>` : ""}
          ${r.status === "finalized" ? `<button class="btn btn-sm btn-pdf act-pdf" data-id="${r.id}" title="PDF">📄</button>` : ""}
          ${r.status !== "cancelled" ? `<button class="btn btn-sm btn-danger act-cancel" data-id="${r.id}" title="Anulo">❌</button>` : ""}
        </td>
      </tr>`).join("") : '<tr><td colspan="10" class="empty-state">Pa fatura B2B për këtë periudhë/filtër</td></tr>'}
      ${finalizedRows.length ? `<tr class="table-total-row"><td colspan="4"><strong>TOTALI (finalizuar)</strong></td>
        <td><strong>${KAPI.fmt(tNet)}</strong></td><td><strong>${KAPI.fmt(tVat)}</strong></td>
        <td><strong>${KAPI.fmt(tGross)} €</strong></td><td colspan="3"></td></tr>` : ""}
      </tbody></table></div>`;

    document.getElementById("b2b-f-apply").onclick = () => {
      this.b2bStatusFilter = document.getElementById("b2b-f-status").value;
      this.b2bPayFilter = document.getElementById("b2b-f-pay").value;
      this.b2bSearch = document.getElementById("b2b-f-search").value;
      this.renderB2B();
    };
    document.getElementById("b2b-f-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("b2b-f-apply").click();
    });

    document.getElementById("add-inv").onclick = () => this.openB2BForm(null);
    document.getElementById("scan-b2b-ai").onclick = () => this.openB2BAiScan();
    document.getElementById("scan-b2b-batch")?.addEventListener("click", () => this.openB2BAiScanBatch());
    this.bindPhotoButtons(el);
    el.querySelector("[data-action='csv']")?.addEventListener("click", () => this.exportB2BCsv(displayRows));
    document.getElementById("cancel-inv").onclick = () => {
      document.getElementById("inv-form").style.display = "none";
      this.editingId = null;
    };
    document.getElementById("save-draft").onclick = () => this.saveB2BInvoice("draft").catch((e) => KAPI.toast(e.message, true));
    document.getElementById("save-final").onclick = () => this.saveB2BInvoice("finalized").catch((e) => KAPI.toast(e.message, true));
    document.getElementById("print-inv").onclick = () => {
      if (!this.editingId) return;
      B2BInvoice.printInvoice(this.editingId).catch((e) => KAPI.toast(e.message, true));
    };
    document.getElementById("pdf-inv").onclick = () => {
      if (!this.editingId) return;
      B2BInvoice.exportPdf(this.editingId).catch((e) => KAPI.toast(e.message, true));
    };

    el.querySelectorAll(".act-view").forEach((b) => b.onclick = () => this.openB2BForm(Number(b.dataset.id)));
    el.querySelectorAll(".act-edit").forEach((b) => b.onclick = () => this.openB2BForm(Number(b.dataset.id)));
    el.querySelectorAll(".act-print").forEach((b) => b.onclick = () => B2BInvoice.printInvoice(b.dataset.id).catch((e) => KAPI.toast(e.message, true)));
    el.querySelectorAll(".act-pdf").forEach((b) => b.onclick = () => B2BInvoice.exportPdf(b.dataset.id).catch((e) => KAPI.toast(e.message, true)));
    el.querySelectorAll(".act-cancel").forEach((b) => b.onclick = async () => {
      if (!confirm("Anulo këtë faturë? Nuk do të hyjë në TVSH dhe librin e shitjeve.")) return;
      await KAPI.api("/sales-invoices/" + b.dataset.id + "/status", { method: "PATCH", body: { status: "cancelled" } });
      KAPI.toast("Fatura u anulua");
      KAPI.emitDataChanged();
    });

    this.bindB2BFormEvents();
  },
};
