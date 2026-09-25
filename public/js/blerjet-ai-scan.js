/** Skanim AI me foto — i përbashkët për të gjitha modulet */
const AiScan = {
  overlay: null,
  mode: "single",
  scanType: "purchase",
  files: [],
  results: [],
  onFillForm: null,

  META: {
    purchase: {
      title: "📷 Skano Faturën e Blerjes",
      batchTitle: "📷 Skano Shumë",
      batchHint: "Ngarko deri në 10 foto faturash blerjeje.",
      hint: "Fotografoni faturën e blerjes — AI lexon furnitorin dhe artikujt.",
      loading: "Duke skanuar me AI...",
      endpoint: "/api/ai/scan",
      invoice: true,
    },
    b2b_sales: {
      title: "📷 Skano Faturën B2B",
      batchTitle: "📷 Skano Shumë",
      batchHint: "Ngarko deri në 10 foto faturash B2B.",
      hint: "Fotografoni faturën B2B — AI lexon të dhënat e blerësit.",
      loading: "Duke skanuar me AI...",
      endpoint: "/api/ai/scan",
      invoice: true,
    },
    z_report: {
      title: "📷 Skano Z-Raportin",
      batchTitle: "📷 Skano Shumë",
      batchHint: "Ngarko deri në 10 foto Z-Raportesh.",
      hint: "Fotografoni Z-Raportin e printuar nga kasa fiskale.",
      loading: "Duke skanuar me AI...",
      endpoint: "/api/ai/scan-z-report",
    },
    expense: {
      title: "📷 Skano Shpenzimin",
      batchTitle: "📷 Skano Shumë",
      batchHint: "Ngarko deri në 10 kupona/fatura shpenzimesh.",
      hint: "Fotografoni faturën/kuponin (rrymë, karburant, qira, etj.).",
      loading: "Duke skanuar me AI...",
      endpoint: "/api/ai/scan-expense",
    },
    client: {
      title: "📷 Skano Certifikatën",
      batchHint: "",
      hint: "Fotografoni certifikatën ARBK ose kartvizitën e klientit.",
      loading: "Duke skanuar me AI...",
      endpoint: "/api/ai/scan-client",
    },
    business_cert: {
      title: "📷 Skano Certifikatën ARBK",
      batchHint: "",
      hint: "Fotografoni certifikatën tuaj ARBK — AI mbush të dhënat e biznesit.",
      loading: "Duke skanuar me AI...",
      endpoint: "/api/ai/scan-business-cert",
    },
  },

  meta() {
    return this.META[this.scanType] || this.META.purchase;
  },

  isB2BSales() {
    return this.scanType === "b2b_sales";
  },

  isInvoice() {
    return !!this.meta().invoice;
  },

  async open(opts = {}) {
    this.mode = opts.batch ? "batch" : "single";
    this.scanType = opts.scanType || "purchase";
    this.onFillForm = opts.onFillForm || null;
    this.files = [];
    this.results = [];

    let hasKey = false;
    try {
      const cfg = await KAPI.api("/ai/config");
      hasKey = !!cfg.has_key;
    } catch { /* ignore */ }

    if (!hasKey) {
      KAPI.toast("Vendosni API Key te Cilësimet → AI", true);
      return;
    }

    this.renderModal();
    document.body.appendChild(this.overlay);
    this.bindEvents();
  },

  close() {
    this.overlay?.remove();
    this.overlay = null;
    this.files.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    this.files = [];
    this.results = [];
  },

  renderModal() {
    const m = this.meta();
    const title = this.mode === "batch" && m.batchTitle ? m.batchTitle : m.title;
    const batchHint = this.mode === "batch" && m.batchHint
      ? `<p class="ai-scan-hint">${m.batchHint}</p>`
      : (m.hint ? `<p class="ai-scan-hint">${m.hint}</p>` : "");

    this.overlay = document.createElement("div");
    this.overlay.className = "modal-overlay ai-scan-overlay";
    this.overlay.innerHTML = `
      <div class="modal ai-scan-modal">
        <div class="ai-scan-header">
          <h2>${title}</h2>
          <button type="button" class="btn btn-sm btn-secondary ai-scan-close" aria-label="Mbyll">✕</button>
        </div>
        ${batchHint}
        <div class="ai-scan-dropzone" id="ai-dropzone">
          <div class="ai-scan-drop-inner">
            <div class="ai-scan-drop-icon">📷</div>
            <p><strong>Tërhiq foton këtu</strong><br>ose kliko për të zgjedhur</p>
            <p class="ai-scan-formats">JPG, PNG, PDF (max 10 MB)</p>
          </div>
          <input type="file" id="ai-file-input" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf,image/*" ${this.mode === "batch" ? "multiple" : ""} hidden>
        </div>
        <div id="ai-previews" class="ai-scan-previews"></div>
        <div id="ai-actions" class="ai-scan-actions" style="display:none">
          <button type="button" class="btn btn-ai-scan" id="ai-read-btn">📷 Lexo me AI</button>
        </div>
        <div id="ai-loading" class="ai-scan-loading" style="display:none">
          <div class="ai-scan-spinner"></div>
          <p id="ai-loading-text">${m.loading || "Duke skanuar me AI..."}</p>
          <p id="ai-loading-step" class="ai-scan-step"></p>
        </div>
        <div id="ai-result" class="ai-scan-result"></div>
        <div id="ai-batch-list" class="ai-scan-batch"></div>
      </div>`;
  },

  bindEvents() {
    const drop = this.overlay.querySelector("#ai-dropzone");
    const input = this.overlay.querySelector("#ai-file-input");

    this.overlay.querySelector(".ai-scan-close").onclick = () => this.close();
    this.overlay.addEventListener("click", (e) => { if (e.target === this.overlay) this.close(); });

    drop.onclick = () => input.click();
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      this.handleFiles(e.dataTransfer.files);
    });
    input.onchange = () => {
      this.handleFiles(input.files);
      input.value = "";
    };

    this.overlay.querySelector("#ai-read-btn").onclick = () => this.runAnalysis();
  },

  async handleFiles(fileList) {
    const max = this.mode === "batch" ? 10 : 1;
    const arr = Array.from(fileList || []).slice(0, max);
    for (const file of arr) {
      if (file.size > 10 * 1024 * 1024) {
        KAPI.toast(`${file.name}: tejkalon 10 MB`, true);
        continue;
      }
      try {
        const prepared = await this.prepareFile(file);
        this.files.push(prepared);
      } catch (e) {
        KAPI.toast(e.message || "Gabim ngarkimi", true);
      }
    }
    this.renderPreviews();
  },

  async prepareFile(file) {
    const type = (file.type || "").toLowerCase();
    const name = file.name || "foto.jpg";

    if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      return this.pdfFirstPageToJpeg(file);
    }
    if (!/^image\/(jpeg|png|jpg|webp|gif)$/.test(type) && !/\.(jpe?g|png|webp)$/i.test(name)) {
      throw new Error("Format i papranuar — JPG, PNG ose PDF");
    }
    const buf = await file.arrayBuffer();
    const base64 = this.arrayBufferToBase64(buf);
    const mimeType = type.includes("png") ? "image/png" : "image/jpeg";
    return {
      name,
      mimeType,
      base64,
      previewUrl: URL.createObjectURL(file),
      originalFile: file,
    };
  },

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  },

  async pdfFirstPageToJpeg(file) {
    const pdfjs = await this.loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    const base64 = this.arrayBufferToBase64(await blob.arrayBuffer());
    return {
      name: (file.name || "dokument.pdf").replace(/\.pdf$/i, ".jpg"),
      mimeType: "image/jpeg",
      base64,
      previewUrl: URL.createObjectURL(blob),
      originalFile: file,
    };
  },

  loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error("PDF.js nuk u ngarkua — provo JPG/PNG"));
      document.head.appendChild(s);
    });
  },

  renderPreviews() {
    const el = this.overlay.querySelector("#ai-previews");
    const actions = this.overlay.querySelector("#ai-actions");
    if (!this.files.length) {
      el.innerHTML = "";
      actions.style.display = "none";
      return;
    }
    el.innerHTML = this.files.map((f, i) => `
      <div class="ai-scan-preview-card">
        <img src="${f.previewUrl}" alt="Preview ${i + 1}">
        <span>${f.name}</span>
        ${this.mode === "batch" ? `<button type="button" class="btn btn-sm btn-secondary ai-rm-file" data-i="${i}">Hiq</button>` : ""}
      </div>`).join("");
    actions.style.display = "flex";
    el.querySelectorAll(".ai-rm-file").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.i);
        const removed = this.files.splice(idx, 1)[0];
        if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        this.renderPreviews();
      };
    });
  },

  async runAnalysis() {
    if (!this.files.length) return;
    const readBtn = this.overlay.querySelector("#ai-read-btn");
    const loading = this.overlay.querySelector("#ai-loading");
    const resultEl = this.overlay.querySelector("#ai-result");
    const batchEl = this.overlay.querySelector("#ai-batch-list");

    if (readBtn) readBtn.disabled = true;
    loading.style.display = "block";
    resultEl.innerHTML = "";
    batchEl.innerHTML = "";
    this.results = [];

    const stepEl = this.overlay.querySelector("#ai-loading-step");
    stepEl.textContent = "";

    try {
      if (this.mode === "batch") {
        for (let i = 0; i < this.files.length; i++) {
          stepEl.textContent = `Dokumenti ${i + 1}/${this.files.length}...`;
          const file = this.files[i];
          try {
            const res = await this.analyzeOne(file);
            this.results.push({ ok: true, file, data: res.data });
          } catch (e) {
            this.results.push({ ok: false, file, error: e.message });
          }
        }
        this.renderBatchResults();
      } else {
        const res = await this.analyzeOne(this.files[0]);
        this.results.push({ ok: true, file: this.files[0], data: res.data });
        this.renderResult(res.data);
      }
    } catch (e) {
      resultEl.innerHTML = `<div class="ai-scan-error">${this.esc(e.message)}</div>`;
      KAPI.toast(e.message || "Gabim skanimi", true);
    } finally {
      loading.style.display = "none";
      if (readBtn) readBtn.disabled = false;
    }
  },

  bindResultActions(data) {
    this.overlay.querySelector("#ai-fill-form")?.addEventListener("click", () => {
      if (this.onFillForm) this.onFillForm(this.mapToForm(data), this.files[0]);
      KAPI.toast("Skanimi u krye — rishikoni fushat");
      this.close();
    });
    this.overlay.querySelector("#ai-retry")?.addEventListener("click", () => {
      this.overlay.querySelector("#ai-result").innerHTML = "";
      this.runAnalysis();
    });
  },

  fieldRow(label, value, conf) {
    const level = conf || (value != null && value !== "" && value !== "—" ? "high" : "not_found");
    return `<div class="ai-field ${this.confClass(level)}"><span>${label}:</span><strong>${value ?? "—"}</strong><em>${this.confIcon(level)}</em></div>`;
  },

  resultShell(fieldsHtml, warningsHtml = "") {
    const preview = this.files[0]?.previewUrl || "";
    return `
      <div class="ai-scan-result-layout">
        <div class="ai-scan-result-photo">${preview ? `<img src="${preview}" alt="Preview">` : ""}</div>
        <div class="ai-scan-result-body">
          <div class="ai-scan-done">✅ Analiza u përfundua</div>
          <h4>Rezultati i AI</h4>
          <div class="ai-scan-fields">${fieldsHtml}</div>
          ${warningsHtml}
          <div class="ai-scan-footer-btns">
            <button type="button" class="btn btn-primary" id="ai-fill-form">📝 Mbush Formularin</button>
            <button type="button" class="btn btn-secondary" id="ai-retry">🔄 Skano Përsëri</button>
          </div>
        </div>
      </div>`;
  },

  renderResult(data) {
    if (this.isInvoice()) {
      this.renderInvoiceResult(data);
    } else {
      this.renderDocumentResult(data);
    }
  },

  renderDocumentResult(data) {
    const c = data.confidence || {};
    let fields = "";
    let warnings = "";

    if (this.scanType === "z_report") {
      const total = Number(data.grand_total) || (Number(data.sales_18) || 0) + (Number(data.sales_8) || 0) + (Number(data.sales_0) || 0);
      fields = [
        this.fieldRow("Data", data.date ? KAPI.fmtDate(this.parseDate(data.date)) : "—", c.report_date || c.date),
        this.fieldRow("Nr. Z-Raport", data.report_number, c.report_number),
        this.fieldRow("Pajisja fiskale", data.fiscal_device || data.device_name, c.fiscal_device),
        this.fieldRow("Shitje 18%", data.sales_18 != null ? `€${KAPI.fmt(data.sales_18)}` : "—", c.sales_18),
        this.fieldRow("Shitje 8%", data.sales_8 != null ? `€${KAPI.fmt(data.sales_8)}` : "—", c.sales_8),
        this.fieldRow("Shitje 0%", data.sales_0 != null ? `€${KAPI.fmt(data.sales_0)}` : "—", c.sales_0),
        this.fieldRow("Totali", total ? `€${KAPI.fmt(total)}` : "—", c.grand_total),
      ].join("");
    } else if (this.scanType === "expense") {
      fields = [
        this.fieldRow("Data", data.expense_date ? KAPI.fmtDate(this.parseDate(data.expense_date)) : "—", c.date || c.expense_date),
        this.fieldRow("Kategoria", data.category, c.category),
        this.fieldRow("Përshkrimi", data.description, c.description),
        this.fieldRow("Shuma", data.amount != null ? `€${KAPI.fmt(data.amount)}` : "—", c.amount),
        this.fieldRow("TVSH %", data.vat_rate != null ? `${data.vat_rate}%` : "—", c.vat_rate),
        this.fieldRow("Furnitori", data.supplier_name, c.supplier_name),
        this.fieldRow("Nr. dëshmie", data.invoice_number || data.receipt_number, c.receipt_number),
      ].join("");
    } else if (this.scanType === "client") {
      fields = [
        this.fieldRow("Emri", data.name, c.name),
        this.fieldRow("NUI", data.nui, c.nui),
        this.fieldRow("Nr. Fiskal", data.fiscal_number, c.fiscal_number),
        this.fieldRow("Adresa", data.address, c.address),
        this.fieldRow("Telefoni", data.phone, c.phone),
        this.fieldRow("Email", data.email, c.email),
      ].join("");
    } else if (this.scanType === "business_cert") {
      fields = [
        this.fieldRow("Emri ligjor", data.business_legal_name, c.business_legal_name),
        this.fieldRow("NUI", data.nui, c.nui),
        this.fieldRow("Nr. Fiskal", data.fiscal_number, c.fiscal_number),
        this.fieldRow("ARBK", data.arbk, c.arbk),
        this.fieldRow("Adresa", data.address, c.address),
        this.fieldRow("Qyteti", data.city, c.city),
      ].join("");
    }

    this.overlay.querySelector("#ai-result").innerHTML = this.resultShell(fields, warnings);
    this.bindResultActions(data);
  },

  renderInvoiceResult(data) {
    const c = data.confidence || {};
    const b2b = this.isB2BSales();
    const partyName = b2b ? (data.buyer_name || data.client_name) : data.supplier_name;
    const partyNui = b2b ? (data.buyer_nui || data.client_nui) : data.supplier_nui;
    const partyFiscal = b2b ? (data.buyer_fiscal || data.client_fiscal) : data.supplier_fiscal;
    const nameConf = b2b ? (c.buyer_name || c.client_name) : c.supplier_name;
    const nuiConf = b2b ? (c.buyer_nui || c.client_nui) : c.supplier_nui;
    const fiscalConf = b2b ? (c.buyer_fiscal || c.client_fiscal) : c.supplier_fiscal;
    const partyLabel = b2b ? "Blerësi" : "Furnitori";

    const items = (data.items || []).map((it, i) => {
      const rate = Math.round((Number(it.vat_rate) || 0.18) * 100);
      const qty = Number(it.quantity) || 0;
      const total = Number(it.total) || qty * Number(it.unit_price || 0);
      return `<li>${i + 1}. ${this.esc(it.description || "—")}, ${qty} ${it.unit || "copë"} × €${KAPI.fmt(it.unit_price || 0)} = €${KAPI.fmt(total)} (${rate}%)</li>`;
    }).join("");

    const warnings = [];
    if (nuiConf === "not_found" || !partyNui) {
      warnings.push(`⚠️ NUI ${b2b ? "i blerësit" : "i furnitorit"} nuk u gjet — plotësoje manualisht`);
    }
    if (fiscalConf === "not_found" || !partyFiscal) {
      warnings.push("⚠️ Nr. Fiskal nuk u gjet — plotësoje manualisht");
    }

    const fields = [
      this.fieldRow(partyLabel, this.esc(partyName || "—"), nameConf),
      this.fieldRow("NUI", this.esc(partyNui || "—"), nuiConf),
      this.fieldRow("Nr. Fiskal", this.esc(partyFiscal || "—"), fiscalConf),
      this.fieldRow("Nr. Faturës", this.esc(data.invoice_number || "—"), c.invoice_number),
      this.fieldRow("Data", data.invoice_date ? KAPI.fmtDate(data.invoice_date) : "—", c.invoice_date),
      `<div class="ai-field-items"><span>Artikujt:</span><ul>${items || "<li>—</li>"}</ul></div>`,
      this.fieldRow("Totali pa TVSH", `€${KAPI.fmt(data.subtotal)}`, "high"),
      this.fieldRow("TVSH", `€${KAPI.fmt(data.vat_total)}`, "high"),
      this.fieldRow("Totali", `€${KAPI.fmt(data.grand_total)}`, "high"),
    ].join("");

    const warnHtml = warnings.map((w) => `<p class="ai-scan-warn">${w}</p>`).join("");
    this.overlay.querySelector("#ai-result").innerHTML = this.resultShell(fields, warnHtml);
    this.bindResultActions(data);
  },

  renderBatchResults() {
    const el = this.overlay.querySelector("#ai-batch-list");
    const typeLabel = {
      z_report: "Z-Raport",
      b2b_sales: "Fatura B2B",
      expense: "Shpenzim",
      purchase: "Fatura",
    }[this.scanType] || "Dokument";

    el.innerHTML = `<h4>Rezultatet (${this.results.length})</h4>` +
      this.results.map((r, i) => {
        if (!r.ok) {
          return `<div class="ai-batch-row warn">⚠️ ${typeLabel} ${i + 1}: ${this.esc(r.error)}</div>`;
        }
        const label = this.batchRowLabel(r.data, i);
        const thumb = r.file?.previewUrl ? `<img class="ai-batch-thumb" src="${r.file.previewUrl}" alt="">` : "";
        return `<div class="ai-batch-row ok">${thumb}<span>✅ ${this.esc(label)}</span>
          <button class="btn btn-sm btn-primary ai-batch-save" data-i="${i}">Ruaj</button></div>`;
      }).join("") +
      `<div class="ai-scan-footer-btns"><button type="button" class="btn btn-primary" id="ai-save-all">Ruaj të gjitha</button></div>`;

    el.querySelectorAll(".ai-batch-save").forEach((btn) => {
      btn.onclick = () => this.saveBatchOne(Number(btn.dataset.i));
    });
    el.querySelector("#ai-save-all").onclick = () => this.saveBatchAll();
  },

  batchRowLabel(data, index) {
    if (this.scanType === "z_report") {
      const d = this.parseDate(data.date) || "—";
      const t = Number(data.grand_total) || (Number(data.sales_18 || 0) + Number(data.sales_8 || 0) + Number(data.sales_0 || 0));
      return `${data.report_number || `Z-${index + 1}`} (${KAPI.fmtDate(d)}) — €${KAPI.fmt(t)}`;
    }
    if (this.scanType === "expense") {
      return `${data.category || "Shpenzim"} — €${KAPI.fmt(data.amount)}`;
    }
    if (this.scanType === "b2b_sales") {
      return `${data.buyer_name || data.client_name || "Blerës"} — €${KAPI.fmt(data.grand_total)}`;
    }
    return `${data.supplier_name || "Furnitor"} — €${KAPI.fmt(data.grand_total)}`;
  },

  async analyzeOne(file) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    const endpoint = this.meta().endpoint || "/api/ai/scan";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: file.base64,
          mimeType: file.mimeType,
          scan_type: this.scanType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || "Gabim analize");
      return data;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("❌ Gabim lidhje — provo përsëri");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  confIcon(level) {
    if (level === "high") return "✅ Gjetur";
    if (level === "medium" || level === "low") return "⚠️ Kontrollo";
    if (level === "not_found") return "— Plotëso manualisht";
    return "⚠️ Kontrollo";
  },

  confClass(level) {
    if (level === "high") return "ok";
    if (level === "not_found") return "missing";
    return "warn";
  },

  parseDate(raw) {
    if (!raw) return "";
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return s;
  },

  mapToForm(data) {
    switch (this.scanType) {
      case "b2b_sales": return this.mapToB2BForm(data);
      case "z_report": return this.mapToZReportForm(data);
      case "expense": return this.mapToExpenseForm(data);
      case "client": return this.mapToClientForm(data);
      case "business_cert": return this.mapToBusinessCertForm(data);
      default: return this.mapToPurchaseForm(data);
    }
  },

  mapToZReportForm(data) {
    return {
      report_date: this.parseDate(data.date),
      report_number: data.report_number || "",
      sales_18_total: Number(data.sales_18) || 0,
      sales_8_total: Number(data.sales_8) || 0,
      sales_0_total: Number(data.sales_0) || 0,
      fiscal_device: data.fiscal_device || data.device_name || "",
    };
  },

  mapToExpenseForm(data) {
    const cats = window.BlerjetApp?.EXPENSE_CATS || [
      "Qira", "Rryma", "Ujë", "Telefon", "Internet", "Paga", "Karburant",
      "Mirëmbajtje", "Sigurime", "Material zyre", "Tjera",
    ];
    let cat = data.category || "Tjera";
    if (!cats.includes(cat)) {
      const lower = cat.toLowerCase();
      cat = cats.find((c) => lower.includes(c.toLowerCase())) || "Tjera";
    }
    const vatRaw = Number(data.vat_rate);
    const vatRate = [0, 8, 18].includes(vatRaw) ? vatRaw : 18;
    return {
      expense_date: this.parseDate(data.expense_date || data.date) || new Date().toISOString().slice(0, 10),
      category: cat,
      description: data.description || data.invoice_number || "Shpenzim",
      amount: Number(data.amount) || 0,
      vat_rate: vatRate,
      supplier_name: data.supplier_name || "",
      supplier_nui: String(data.supplier_nui || "").replace(/\D/g, ""),
      supplier_fiscal: data.supplier_fiscal || "",
      receipt_number: data.invoice_number || data.receipt_number || "",
    };
  },

  mapToClientForm(data) {
    return {
      name: data.name || "",
      nui: String(data.nui || "").replace(/\D/g, ""),
      phone: data.phone || "",
      email: data.email || "",
      address: data.address || "",
      fiscal_number: data.fiscal_number || "",
    };
  },

  mapToBusinessCertForm(data) {
    return {
      business_legal_name: data.business_legal_name || "",
      business_trade_name: data.business_trade_name || data.business_legal_name || "",
      business_type: data.business_type || "SH.P.K.",
      nui: String(data.nui || "").replace(/\D/g, ""),
      fiscal_number: data.fiscal_number || data.nui || "",
      arbk: data.arbk || "",
      vat_number: data.vat_number || "",
      registration_date: this.parseDate(data.registration_date),
      address: data.address || "",
      city: data.city || "",
      municipality: data.municipality || "",
      phone: data.phone || "",
      email: data.email || "",
    };
  },

  mapToPurchaseForm(data) {
    const payMap = {
      cash: "cash", para: "cash", "para në dorë": "cash",
      card: "card", kartë: "card", karte: "card",
      transfer: "transfer", bank: "transfer", "transfer bankar": "transfer",
    };
    const rawPay = String(data.payment_method || "").toLowerCase();
    let payment = "cash";
    for (const [k, v] of Object.entries(payMap)) {
      if (rawPay.includes(k)) { payment = v; break; }
    }

    const items = (data.items || []).map((it) => {
      const qty = Number(it.quantity) || 1;
      const rate = Number(it.vat_rate);
      const vatPct = rate <= 1 ? Math.round(rate * 100) : rate;
      const vatRate = [0, 8, 18].includes(vatPct) ? vatPct : 18;
      let grossUnit = 0;
      if (Number(it.total) > 0 && qty > 0) {
        grossUnit = Number(it.total) / qty;
      } else if (Number(it.unit_price) > 0) {
        grossUnit = Number(it.unit_price) * (1 + vatRate / 100);
      }
      return {
        description: it.description || "Artikull",
        quantity: qty,
        unit: it.unit || "copë",
        unit_price_with_vat: Math.round(grossUnit * 100) / 100,
        vat_rate: vatRate,
      };
    });

    if (!items.length) {
      items.push({ description: "Mall", quantity: 1, unit_price_with_vat: Number(data.grand_total) || 118, vat_rate: 18, unit: "copë" });
    }

    return {
      supplier_name: data.supplier_name || "",
      supplier_nui: data.supplier_nui || "",
      supplier_fiscal: data.supplier_fiscal || "",
      supplier_invoice_number: data.invoice_number || "",
      invoice_date: this.parseDate(data.invoice_date) || new Date().toISOString().slice(0, 10),
      payment_method: payment,
      items,
    };
  },

  mapToB2BForm(data) {
    const payMap = {
      cash: "cash", para: "cash", "para në dorë": "cash",
      card: "card", kartë: "card", karte: "card",
      transfer: "transfer", bank: "transfer", "transfer bankar": "transfer",
      deferred: "deferred", shtyrë: "deferred",
    };
    const rawPay = String(data.payment_method || "").toLowerCase();
    let payment = "transfer";
    for (const [k, v] of Object.entries(payMap)) {
      if (rawPay.includes(k)) { payment = v; break; }
    }

    const items = (data.items || []).map((it) => {
      const qty = Number(it.quantity) || 1;
      const rate = Number(it.vat_rate);
      const vatPct = rate <= 1 ? Math.round(rate * 100) : rate;
      const vatRate = [0, 8, 18].includes(vatPct) ? vatPct : 18;
      let netUnit = Number(it.unit_price) || 0;
      if (!netUnit && Number(it.total) > 0 && qty > 0) {
        const gross = Number(it.total) / qty;
        netUnit = vatRate > 0 ? gross / (1 + vatRate / 100) : gross;
      }
      return {
        description: it.description || "Artikull",
        quantity: qty,
        unit: it.unit || "copë",
        unit_price: Math.round(netUnit * 100) / 100,
        vat_rate: vatRate,
      };
    });

    if (!items.length) {
      items.push({ description: "Shërbim", quantity: 1, unit_price: Number(data.subtotal) || 100, vat_rate: 18, unit: "copë" });
    }

    return {
      client_name: data.buyer_name || data.client_name || "",
      client_nui: String(data.buyer_nui || data.client_nui || "").replace(/\D/g, ""),
      client_fiscal: data.buyer_fiscal || data.client_fiscal || "",
      client_address: data.buyer_address || data.client_address || "—",
      invoice_number: data.invoice_number || "",
      invoice_date: this.parseDate(data.invoice_date) || new Date().toISOString().slice(0, 10),
      payment_method: payment,
      items,
    };
  },

  async saveBatchOne(index) {
    const r = this.results[index];
    if (!r?.ok || r.saved) return;
    try {
      await this.persistBatchItem(this.mapToForm(r.data), r.file);
      r.saved = true;
      KAPI.emitDataChanged();
      KAPI.toast(`${this.batchRowLabel(r.data, index)} u ruajt`);
    } catch (e) {
      KAPI.toast(e.message, true);
    }
  },

  async saveBatchAll() {
    let n = 0;
    for (let i = 0; i < this.results.length; i++) {
      const r = this.results[i];
      if (!r.ok || r.saved) continue;
      try {
        await this.persistBatchItem(this.mapToForm(r.data), r.file);
        r.saved = true;
        n++;
      } catch (e) {
        KAPI.toast(`${this.batchRowLabel(r.data, i)}: ${e.message}`, true);
      }
    }
    if (n) {
      KAPI.toast(`${n} regjistrime u ruajtën`);
      KAPI.emitDataChanged();
      this.close();
    }
  },

  async persistBatchItem(mapped, file) {
    switch (this.scanType) {
      case "z_report":
        if (!window.ShitjetApp?.saveZFromAi) throw new Error("Moduli Z-Raport mungon");
        return ShitjetApp.saveZFromAi(mapped, file);
      case "b2b_sales":
        if (!window.ShitjetApp?.saveB2BFromAi) throw new Error("Moduli B2B mungon");
        return ShitjetApp.saveB2BFromAi(mapped, file);
      case "expense":
        if (!window.BlerjetApp?.saveExpenseFromAi) throw new Error("Moduli Shpenzime mungon");
        return BlerjetApp.saveExpenseFromAi(mapped, file);
      default:
        return BlerjetApp.saveFromAi(mapped, file);
    }
  },

  esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  },
};

window.AiScan = AiScan;
window.BlerjetAiScan = AiScan;
