/** AI — statistika skanimi (konfigurimi bëhet nga administratori) */
const AiApp = {
  async init() {
    const cfg = await KAPI.api("/ai/config");
    const root = document.getElementById("module-root");
    root.innerHTML = `
      <div class="card">
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);max-width:400px">
          <div class="kpi-card"><div class="label">Skane të kryera</div><div class="value">${cfg.scan_count ?? 0}</div></div>
          <div class="kpi-card"><div class="label">Statusi</div><div class="value">${cfg.has_key ? "✅ Gati" : "—"}</div></div>
        </div>
      </div>`;
  },
};
