/** PDF / print profesional — header ATK nga Settings */
const PdfExport = {
  header(settings, title, periodFrom, periodTo) {
    const s = settings || {};
    const addr = [s.address, s.city, s.municipality].filter(Boolean).join(", ");
    return `
      <div class="pdf-header">
        <div class="pdf-company">${s.business_legal_name || "—"}</div>
        ${s.business_trade_name ? `<div class="pdf-trade">${s.business_trade_name}</div>` : ""}
        <div class="pdf-meta">NUI: ${s.nui || "—"} · Nr. Fiskal: ${s.fiscal_number || "—"} · ARBK: ${s.arbk || "—"}</div>
        ${s.vat_number ? `<div class="pdf-meta">Nr. TVSH: ${s.vat_number}</div>` : ""}
        <div class="pdf-meta">${addr || "—"} · ${s.phone || ""} · ${s.email || ""}</div>
        <h1 class="pdf-title">${title}</h1>
        <div class="pdf-period">Periudha: ${KAPI.fmtDate(periodFrom)} — ${KAPI.fmtDate(periodTo)}</div>
        <div class="pdf-gen">Gjeneruar: ${new Date().toLocaleString("sq-AL")}</div>
      </div>`;
  },

  footer(settings) {
    const s = settings || {};
    const acc = s.accountant_name
      ? `Kontabilisti: ${s.accountant_name}${s.accountant_license ? " (Lic. " + s.accountant_license + ")" : ""}`
      : "";
    return `<div class="pdf-footer">${acc ? acc + " · " : ""}Revolution Kontabilisti · ${new Date().toLocaleDateString("sq-AL")}</div>`;
  },

  styles() {
    return `<style>
      @media print { @page { size: A4; margin: 14mm; } }
      body { font-family: Arial, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .pdf-header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 14px; }
      .pdf-company { font-size: 14px; font-weight: 700; }
      .pdf-trade { font-size: 11px; color: #444; margin-top: 2px; }
      .pdf-meta { color: #555; font-size: 10px; margin-top: 2px; }
      .pdf-title { font-size: 16px; margin: 10px 0 4px; text-transform: uppercase; }
      .pdf-period, .pdf-gen { font-size: 10px; color: #444; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; }
      th { background: #eee; font-weight: 700; }
      tfoot td { font-weight: 700; background: #f5f5f5; }
      .pdf-footer { margin-top: 16px; font-size: 9px; color: #666; text-align: center; }
    </style>`;
  },

  fullDocument(title, bodyHtml, settings, from, to) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${this.styles()}</head><body>
      ${this.header(settings, title, from, to)}
      ${bodyHtml}
      ${this.footer(settings)}
    </body></html>`;
  },

  async printHtml(title, bodyHtml, settings, from, to) {
    const doc = this.fullDocument(title, bodyHtml, settings, from, to);
    if (window.kontabilisti?.printHtml) {
      const r = await window.kontabilisti.printHtml(doc, title);
      if (!r.ok) throw new Error(r.error || "Printimi dështoi");
      return;
    }
    const w = window.open("", "_blank");
    w.document.write(doc);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  },

  printHtmlSync(title, bodyHtml, settings, from, to) {
    this.printHtml(title, bodyHtml, settings, from, to).catch((e) => KAPI.toast(e.message, true));
  },

  async exportPdf(title, bodyHtml, settings, from, to, filename) {
    const doc = this.fullDocument(title, bodyHtml, settings, from, to);
    if (window.kontabilisti?.savePdf) {
      const r = await window.kontabilisti.savePdf(doc, title, filename || `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
      if (r.cancelled) return r;
      if (!r.ok) throw new Error(r.error || "PDF dështoi");
      KAPI.toast(`PDF u ruajt: ${pathBasename(r.path)}`);
      return r;
    }
    return this.printHtml(title, bodyHtml, settings, from, to);
  },

  exportPdfSync(title, bodyHtml, settings, from, to, filename) {
    this.exportPdf(title, bodyHtml, settings, from, to, filename).catch((e) => KAPI.toast(e.message, true));
  },
};

function pathBasename(p) {
  if (!p) return "raport.pdf";
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

window.PdfExport = PdfExport;
