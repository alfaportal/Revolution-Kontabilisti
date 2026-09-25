/** Eksport CSV — UTF-8 BOM, pikëpresje, format europian për Excel */
const CsvExport = {
  fmtDate(iso) {
    if (!iso) return "";
    const s = String(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  },

  fmtNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    return v.toFixed(2);
  },

  cell(v) {
    if (v == null) return "";
    const s = String(v);
    if (/[;"'\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  },

  build(headers, rows) {
    const lines = [headers.map((h) => this.cell(h)).join(";")];
    rows.forEach((r) => lines.push(r.map((c) => this.cell(c)).join(";")));
    return "\uFEFF" + lines.join("\r\n");
  },

  monthSuffix(fromIso) {
    if (!fromIso) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    return String(fromIso).slice(0, 7);
  },

  quarterSuffix(fromIso) {
    const d = fromIso ? new Date(fromIso) : new Date();
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  },

  toolbar(opts = {}) {
    const p = opts.print !== false;
    const pdf = !!opts.pdf;
    const csv = opts.csv !== false;
    return [
      p ? '<button type="button" class="btn btn-print btn-sm" data-action="print">🖨 Printo</button>' : "",
      pdf ? '<button type="button" class="btn btn-pdf btn-sm" data-action="pdf">📄 PDF</button>' : "",
      csv ? '<button type="button" class="btn btn-csv btn-sm" data-action="csv">📥 Eksporto CSV</button>' : "",
      opts.extra || "",
    ].filter(Boolean).join(" ");
  },

  async save(filename, headers, rows) {
    const content = this.build(headers, rows);
    if (window.kontabilisti?.saveCsv) {
      const r = await window.kontabilisti.saveCsv(filename, content);
      if (r.cancelled) return r;
      if (!r.ok) throw new Error(r.error || "Gabim eksporti");
      KAPI.toast(`CSV u ruajt: ${filename}`);
      return r;
    }
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    KAPI.toast(`CSV u shkarkua: ${filename}`);
    return { ok: true };
  },
};

window.CsvExport = CsvExport;
