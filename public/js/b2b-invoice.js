/** Faturat B2B — llogaritje, printim A4, autocomplete klientësh */
const B2BInvoice = {
  UNITS: ["copë", "kg", "litër", "m²", "orë", "shërbim", "ditë", "muaj"],
  PAY_LABELS: { cash: "Para në dorë", card: "Kartelë", transfer: "Transfer bankar", deferred: "Pagesë e shtyrë" },
  PAY_STATUS_LABELS: { paid: "E paguar", partial: "Pjesërisht", unpaid: "E papaguar" },
  STATUS_LABELS: { draft: "📝 Draft", finalized: "✅ Finalizuar", cancelled: "❌ Anuluar" },

  calcLine(qty, unitNet, vatRate) {
    const q = Number(qty) || 0;
    const p = Number(unitNet) || 0;
    const rate = Number(vatRate) || 0;
    const base = Math.round(q * p * 100) / 100;
    const vat = rate > 0 ? Math.round(base * (rate / 100) * 100) / 100 : 0;
    const gross = Math.round((base + vat) * 100) / 100;
    return { base, vat, gross };
  },

  calcItemsFromDom(container) {
    const lines = [...container.querySelectorAll(".b2b-item-row")];
    let subtotal = 0, vat18 = 0, vat8 = 0, vat0 = 0;
    const items = lines.map((line) => {
      const qty = Number(line.querySelector(".it-qty")?.value) || 0;
      const unitNet = Number(line.querySelector(".it-price-net")?.value) || 0;
      const vatRate = Number(line.querySelector(".it-vat")?.value) || 0;
      const { base, vat, gross } = this.calcLine(qty, unitNet, vatRate);
      if (vatRate === 18) { vat18 += vat; subtotal += base; }
      else if (vatRate === 8) { vat8 += vat; subtotal += base; }
      else { vat0 += base; subtotal += base; }
      return {
        description: line.querySelector(".it-desc")?.value || "",
        unit: line.querySelector(".it-unit")?.value || "copë",
        quantity: qty,
        unit_price: unitNet,
        vat_rate: vatRate,
        base, vat, gross,
      };
    });
    const vatTotal = Math.round((vat18 + vat8) * 100) / 100;
    const grandTotal = Math.round((subtotal + vatTotal) * 100) / 100;
    return { items, subtotal, vat18, vat8, vat0, vatTotal, grandTotal };
  },

  updateTotalsPreview(container, previewEl, paidInput) {
    const t = this.calcItemsFromDom(container);
    const paid = Number(paidInput?.value) || 0;
    const debt = Math.max(0, Math.round((t.grandTotal - paid) * 100) / 100);
    if (!previewEl) return t;
    previewEl.innerHTML = `
      <div class="b2b-totals-box">
        <div class="b2b-total-line"><span>Nëntotali (pa TVSH):</span><strong>${KAPI.fmt(t.subtotal)} €</strong></div>
        <div class="b2b-total-line"><span>TVSH 18%:</span><strong>${KAPI.fmt(t.vat18)} €</strong></div>
        <div class="b2b-total-line"><span>TVSH 8%:</span><strong>${KAPI.fmt(t.vat8)} €</strong></div>
        <div class="b2b-total-line"><span>TVSH 0% (baza):</span><strong>${KAPI.fmt(t.vat0)} €</strong></div>
        <div class="b2b-total-line"><span>TVSH Totale:</span><strong>${KAPI.fmt(t.vatTotal)} €</strong></div>
        <div class="b2b-total-line b2b-grand"><span>TOTALI ME TVSH:</span><strong>${KAPI.fmt(t.grandTotal)} €</strong></div>
        ${paidInput ? `<div class="b2b-total-line"><span>Borxhi mbetur:</span><strong>${KAPI.fmt(debt)} €</strong></div>` : ""}
      </div>`;
    return t;
  },

  itemRowHtml(item = {}, idx = 0) {
    const uOpts = this.UNITS.map((u) => `<option ${item.unit === u ? "selected" : ""}>${u}</option>`).join("");
    return `<div class="b2b-item-row form-grid" data-idx="${idx}">
      <div class="form-group b2b-item-nr"><label>Nr.</label><span class="item-num">${idx + 1}</span></div>
      <div class="form-group"><label>Përshkrimi *</label><input class="it-desc" value="${item.description || ""}"></div>
      <div class="form-group"><label>Njësia</label><select class="it-unit">${uOpts}</select></div>
      <div class="form-group"><label>Sasia</label><input type="number" class="it-qty" value="${item.quantity ?? 1}" min="0.01" step="0.01"></div>
      <div class="form-group"><label>Çmimi/njësi pa TVSH (€)</label><input type="number" class="it-price-net" value="${item.unit_price ?? ""}" min="0" step="0.01"></div>
      <div class="form-group"><label>TVSH</label><select class="it-vat">
        <option value="18" ${Number(item.vat_rate) === 18 ? "selected" : ""}>18%</option>
        <option value="8" ${Number(item.vat_rate) === 8 ? "selected" : ""}>8%</option>
        <option value="0" ${Number(item.vat_rate) === 0 ? "selected" : ""}>0%</option>
      </select></div>
      <div class="form-group b2b-item-del"><label>&nbsp;</label><button type="button" class="btn btn-sm btn-danger del-item" title="Fshi">🗑</button></div>
    </div>`;
  },

  fillClientFields(c) {
    if (!c) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set("inv_client", c.name);
    set("inv_nui", c.nui);
    set("inv_fiscal", c.fiscal_number);
    set("inv_arbk", c.arbk);
    set("inv_vat", c.vat_number);
    set("inv_addr", c.address);
    set("inv_city", c.city);
    set("inv_phone", c.phone);
    set("inv_email", c.email);
    set("inv_contact", c.contact_person);
  },

  collectFormBody(status) {
    const g = (id) => document.getElementById(id)?.value?.trim() || "";
    const itemsEl = document.getElementById("inv-items");
    const calc = this.calcItemsFromDom(itemsEl);
    const payStatus = document.querySelector('input[name="inv_pay_status"]:checked')?.value || "unpaid";
    return {
      invoice_date: g("inv_date"),
      due_date: g("inv_due") || null,
      order_number: g("inv_order"),
      client_name: g("inv_client"),
      client_nui: g("inv_nui").replace(/\D/g, ""),
      client_fiscal: g("inv_fiscal"),
      client_arbk: g("inv_arbk"),
      client_vat_number: g("inv_vat"),
      client_address: g("inv_addr"),
      client_city: g("inv_city"),
      client_phone: g("inv_phone"),
      client_email: g("inv_email"),
      client_contact: g("inv_contact"),
      payment_method: document.querySelector('input[name="inv_pay_method"]:checked')?.value || "transfer",
      payment_status: payStatus,
      amount_paid: Number(g("inv_paid")) || 0,
      notes: g("inv_notes"),
      payment_terms: g("inv_terms"),
      status,
      items: calc.items.map((it) => ({
        description: it.description,
        unit: it.unit,
        quantity: it.quantity,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
      })),
    };
  },

  normVatRate(rate) {
    const r = Number(rate);
    if (r === 18 || r === 0.18) return 18;
    if (r === 8 || r === 0.08) return 8;
    return 0;
  },

  populateForm(invoice, items) {
    const inv = invoice || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };
    set("inv_num", inv.invoice_number || "");
    set("inv_date", inv.invoice_date || new Date().toISOString().slice(0, 10));
    set("inv_due", inv.due_date || "");
    set("inv_order", inv.order_number || "");
    set("inv_client", inv.client_name || "");
    set("inv_nui", inv.client_nui || "");
    set("inv_fiscal", inv.client_fiscal || "");
    set("inv_arbk", inv.client_arbk || "");
    set("inv_vat", inv.client_vat_number || "");
    set("inv_addr", inv.client_address || "");
    set("inv_city", inv.client_city || "");
    set("inv_phone", inv.client_phone || "");
    set("inv_email", inv.client_email || "");
    set("inv_contact", inv.client_contact || "");
    set("inv_paid", inv.amount_paid ?? "");
    set("inv_notes", inv.notes || "");
    set("inv_terms", inv.payment_terms || "");
    const pm = inv.payment_method || "transfer";
    document.querySelector(`input[name="inv_pay_method"][value="${pm}"]`)?.click();
    const ps = inv.payment_status || "unpaid";
    document.querySelector(`input[name="inv_pay_status"][value="${ps}"]`)?.click();
    const box = document.getElementById("inv-items");
    const rows = (items && items.length) ? items : [{ description: "", quantity: 1, unit_price: "", vat_rate: 18, unit: "copë" }];
    box.innerHTML = rows.map((it, i) => this.itemRowHtml({
      ...it,
      vat_rate: this.normVatRate(it.vat_rate),
    }, i)).join("");
    this.togglePaymentFields();
  },

  togglePaymentFields() {
    const method = document.querySelector('input[name="inv_pay_method"]:checked')?.value;
    const status = document.querySelector('input[name="inv_pay_status"]:checked')?.value;
    const dueWrap = document.getElementById("inv-due-wrap");
    const paidWrap = document.getElementById("inv-paid-wrap");
    if (dueWrap) dueWrap.style.display = method === "deferred" ? "block" : "";
    if (paidWrap) paidWrap.style.display = status === "partial" ? "block" : "";
  },

  buildInvoiceHtml(inv, items, settings) {
    const s = settings || {};
    const addr = [s.address, s.city, s.municipality].filter(Boolean).join(", ");
    const payLabel = this.PAY_LABELS[inv.payment_method] || inv.payment_method;
    const rows = (items || []).map((it) => `<tr>
      <td>${it.item_number}</td><td>${it.description}</td><td>${it.quantity} ${it.unit || ""}</td>
      <td style="text-align:right">${KAPI.fmt(it.unit_price)}</td>
      <td style="text-align:right">${KAPI.fmt(it.vat_amount)}</td>
      <td style="text-align:right">${KAPI.fmt(it.total_with_vat)}</td>
    </tr>`).join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Faturë ${inv.invoice_number}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: Arial, sans-serif; color: #111; font-size: 11px; padding: 24px; max-width: 800px; margin: 0 auto; }
        .inv-top { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; }
        .inv-co { font-size: 15px; font-weight: 700; }
        .inv-meta { color: #555; font-size: 10px; margin-top: 3px; }
        .inv-title { text-align: center; font-size: 18px; font-weight: 700; margin: 20px 0; letter-spacing: 2px; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 8px; }
        .inv-block { margin: 14px 0; }
        .inv-block h4 { margin: 0 0 6px; font-size: 11px; color: #2563eb; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #bbb; padding: 6px 8px; }
        th { background: #eef2ff; font-size: 10px; }
        tfoot td { font-weight: 700; background: #f8fafc; }
        .inv-footer { margin-top: 28px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 10px; color: #666; }
        .sign { margin-top: 40px; }
      </style></head><body>
      <div class="inv-top">
        <div class="inv-co">${s.business_legal_name || "—"}</div>
        <div class="inv-meta">NUI: ${s.nui || "—"} | Nr. Fiskal: ${s.fiscal_number || "—"} | ARBK: ${s.arbk || "—"}</div>
        <div class="inv-meta">${addr} | Tel: ${s.phone || "—"} | ${s.email || "—"}</div>
      </div>
      <div class="inv-title">FATURË</div>
      <div class="inv-block">
        <strong>Nr. Faturës:</strong> ${inv.invoice_number}<br>
        <strong>Data:</strong> ${KAPI.fmtDate(inv.invoice_date)}
        ${inv.due_date ? `<br><strong>Data e skadimit:</strong> ${KAPI.fmtDate(inv.due_date)}` : ""}
        ${inv.order_number ? `<br><strong>Nr. porosisë:</strong> ${inv.order_number}` : ""}
      </div>
      <div class="inv-block">
        <h4>Klienti</h4>
        <strong>${inv.client_name || "—"}</strong><br>
        NUI: ${inv.client_nui || "—"} | Nr. Fiskal: ${inv.client_fiscal || "—"}<br>
        ${inv.client_address || "—"}
      </div>
      <table>
        <thead><tr><th>Nr.</th><th>Përshkrimi</th><th>Sasia</th><th>Çmimi pa TVSH</th><th>TVSH</th><th>Totali me TVSH</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="3">NËNTOTALI</td><td style="text-align:right">${KAPI.fmt(inv.subtotal)}</td><td></td><td></td></tr>
          <tr><td colspan="3">TVSH 18%</td><td></td><td style="text-align:right">${KAPI.fmt(inv.vat_18)}</td><td></td></tr>
          <tr><td colspan="3">TVSH 8%</td><td></td><td style="text-align:right">${KAPI.fmt(inv.vat_8)}</td><td></td></tr>
          <tr><td colspan="5"><strong>TOTALI ME TVSH</strong></td><td style="text-align:right"><strong>${KAPI.fmt(inv.grand_total)} €</strong></td></tr>
        </tfoot>
      </table>
      <div class="inv-block">
        <strong>Mënyra e pagesës:</strong> ${payLabel}<br>
        ${inv.payment_terms ? `<strong>Kushtet:</strong> ${inv.payment_terms}<br>` : ""}
        ${inv.notes ? `<strong>Shënime:</strong> ${inv.notes}` : ""}
      </div>
      <div class="sign">
        Lëshuar nga: ${s.owner_name || "—"}<br><br>
        Nënshkrimi: _______________________
      </div>
      <div class="inv-footer" style="text-align:right">Faqe 1 / 1 · ${new Date().toLocaleString("sq-AL")}</div>
    </body></html>`;
  },

  async openInvoiceWindow(id, { mode = "view" } = {}) {
    const [data, settingsRes] = await Promise.all([
      KAPI.api("/sales-invoices/" + id),
      KAPI.api("/settings"),
    ]);
    const html = this.buildInvoiceHtml(data.invoice, data.items || [], settingsRes.settings || {});
    const title = `Faturë ${data.invoice.invoice_number || id}`;

    if (mode === "print" && window.kontabilisti?.printHtml) {
      const r = await window.kontabilisti.printHtml(html, title);
      if (!r.ok) throw new Error(r.error || "Printimi dështoi");
      return;
    }
    if (mode === "pdf" && window.kontabilisti?.savePdf) {
      const r = await window.kontabilisti.savePdf(html, title, `fatura-${data.invoice.invoice_number || id}.pdf`);
      if (r.cancelled) return;
      if (!r.ok) throw new Error(r.error || "PDF dështoi");
      KAPI.toast(`PDF u ruajt: fatura-${data.invoice.invoice_number || id}.pdf`);
      return;
    }

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    if (mode === "print") setTimeout(() => w.print(), 350);
  },

  async printInvoice(id) {
    return this.openInvoiceWindow(id, { mode: "print" });
  },

  async viewInvoice(id) {
    return this.openInvoiceWindow(id, { mode: "view" });
  },

  async exportPdf(id) {
    return this.openInvoiceWindow(id, { mode: "pdf" });
  },
};

window.B2BInvoice = B2BInvoice;
