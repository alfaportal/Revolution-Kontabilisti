function bootKontabilisti() {
  if (!window.KAPI) {
    showFatal("Moduli API nuk u ngarkua. Kontrollo lidhjen me serverin.");
    return;
  }

  const { api, toast } = window.KAPI;

  const MODULES = {
    pasqyra: { title: "Pasqyra", init: () => PasqyraApp.init() },
    shitjet: { title: "Shitjet", init: () => ShitjetApp.init() },
    klientet: { title: "Klientët B2B", init: () => KlientetApp.init() },
    blerjet: { title: "Blerjet", init: () => BlerjetApp.init() },
    ditari: { title: "Ditari", init: () => DitariApp.init() },
    raportet: { title: "Raportet", init: () => RaportetApp.init() },
    kontabilisti: { title: "Kontabilisti", init: () => KontabilistiApp.init() },
    "dergo-atk": { title: "Dërgo në ATK", init: () => DergoAtkApp.init() },
    ai: { title: "AI", init: () => AiApp.init() },
    licenca: { title: "Licenca", init: () => LicencaApp.init() },
    cilesimet: { title: "Cilësimet", init: () => CilesimetApp.init() },
  };

  let currentModule = "pasqyra";
  let wizardBlocking = false;
  let settingsReady = false;
  const isProdShell = new URLSearchParams(window.location.search).get("protected") === "1";

  function updateHeader(settings, complete) {
    const s = settings || {};
    const legal = s.business_legal_name || "Regjistro biznesin";
    const bizName = document.getElementById("biz-name");
    const bizMeta = document.getElementById("biz-meta");
    if (complete && s.nui) {
      bizName.textContent = `${legal} — NUI: ${s.nui}`;
      bizMeta.textContent = [s.business_trade_name, s.municipality].filter(Boolean).join(" · ");
    } else {
      bizName.textContent = legal;
      bizMeta.textContent = s.nui ? `NUI: ${s.nui}` : "Plotësoni regjistrimin e biznesit";
    }
  }

  async function loadSettings() {
    const data = await api("/settings");
    updateHeader(data.settings, data.complete);
    if (!data.complete && window.BizWizard) {
      wizardBlocking = true;
      BizWizard.onComplete = async () => {
        wizardBlocking = false;
        settingsReady = true;
        const fresh = await api("/settings");
        updateHeader(fresh.settings, fresh.complete);
        await loadAlerts();
        await navigate("pasqyra");
      };
      BizWizard.show(true, data.settings);
    } else {
      wizardBlocking = false;
      settingsReady = true;
    }
    return data;
  }

  async function loadAlerts(showPopup = false) {
    try {
      const dash = await api("/dashboard");
      if (window.DeadlineAlertsUI) {
        DeadlineAlertsUI.renderBanner(dash.alerts, dash.settings);
        DeadlineAlertsUI.renderBadge(dash.openCount, dash.alerts, dash.settings);
        DeadlineAlertsUI.renderUrgentTab(dash.alerts, dash.settings);
      }
    } catch { /* ignore */ }
  }

  async function navigate(module) {
    if (wizardBlocking || (window.BizWizard && BizWizard.isBlocking && BizWizard.isBlocking())) {
      toast("Plotësoni regjistrimin e biznesit fillimisht", true);
      return;
    }
    currentModule = module;
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.module === module);
    });
    const root = document.getElementById("module-root");
    root.innerHTML = `<div class="empty-state">Duke ngarkuar ${MODULES[module].title}...</div>`;
    await MODULES[module].init();
  }

  async function checkUpdateNotice() {
    try {
      const n = await api("/app/update-notice");
      if (!n.show) return;
      const modal = document.getElementById("update-modal");
      document.getElementById("update-version").textContent = `Versioni i ri: ${n.version}`;
      document.getElementById("update-notes").innerHTML = (n.notes || [])
        .map((x) => `<li>${x}</li>`).join("");
      modal.style.display = "flex";
      document.getElementById("update-ok").onclick = async () => {
        modal.style.display = "none";
        await api("/app/update-notice/dismiss", { method: "POST" });
      };
    } catch { /* ignore */ }
  }

  window.kontabilistiNavigate = navigate;

  window.kontabilisti?.onBackupNotice?.((payload) => {
    if (payload?.message) toast(payload.message, !payload.ok, payload.ms || 3000);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      if (window.printContext?.print) {
        e.preventDefault();
        window.printContext.print();
      }
    }
  });

  document.getElementById("nav-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (btn?.dataset.module) navigate(btn.dataset.module);
  });

  const wizardModal = document.getElementById("wizard-modal");
  wizardModal?.addEventListener("click", (e) => {
    if (e.target === wizardModal && wizardModal.classList.contains("wizard-locked")) {
      toast("Plotësoni regjistrimin e biznesit për të vazhduar", true);
    }
  });

  if (window.kontabilisti?.onCloseRequest) {
    window.kontabilisti.onCloseRequest(() => {
      if (wizardBlocking) {
        toast("Plotësoni regjistrimin e biznesit fillimisht", true);
        return;
      }
      document.getElementById("close-modal").style.display = "flex";
    });
  }

  document.getElementById("close-cancel")?.addEventListener("click", () => {
    document.getElementById("close-modal").style.display = "none";
  });
  document.getElementById("close-no-backup")?.addEventListener("click", () => {
    window.kontabilisti?.quit({ withBackup: false });
  });
  document.getElementById("close-with-backup")?.addEventListener("click", async () => {
    await window.kontabilisti?.quit({ withBackup: true });
  });

  window.addEventListener("kontabilisti:data-changed", () => {
    loadAlerts();
    api("/settings").then((d) => updateHeader(d.settings, d.complete)).catch(() => {});
    if (currentModule === "kontabilisti" && window.KontabilistiApp?.refresh) {
      KontabilistiApp.refresh().catch(() => navigate("kontabilisti"));
    } else if (currentModule !== "cilesimet" && settingsReady) {
      navigate(currentModule);
    }
  });

  (async () => {
    try {
      await loadSettings();
      if (!wizardBlocking) {
        await checkUpdateNotice();
        await loadAlerts(true);
        await navigate("pasqyra");
      } else {
        document.getElementById("module-root").innerHTML =
          '<div class="empty-state"><p>Plotësoni regjistrimin e biznesit për të filluar.</p></div>';
      }
    } catch (e) {
      showFatal(e.message || String(e));
    }
  })();
}

function showFatal(msg) {
  const root = document.getElementById("module-root");
  if (root) {
    root.innerHTML = `<div class="card"><h3>Gabim</h3><p style="color:var(--danger)">${msg}</p><p class="hint">Provo: mbyll programin nga Task Manager dhe hap përsëri.</p><button class="btn btn-primary" onclick="location.reload()">Rifresko</button></div>`;
  }
}

window.addEventListener("error", (e) => showFatal(e.message || "Gabim JavaScript"));
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason?.message || String(e.reason)));

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootKontabilisti);
} else {
  bootKontabilisti();
}
