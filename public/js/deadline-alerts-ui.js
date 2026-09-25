/** Alarmet / njoftimet për afatet ATK — badge + dropdown */
const DeadlineAlertsUI = {
  LEVEL_CLASS: {
    reminder: "dl-reminder",
    warning: "dl-warning",
    urgent: "dl-urgent",
    overdue: "dl-overdue",
  },

  URGENCY_ORDER: { overdue: 0, urgent: 1, warning: 2, reminder: 3, ok: 9 },

  _alertsCache: [],
  _settingsCache: null,
  _dropdownOpen: false,
  _dropdownView: "list",
  _dropdownFilter: "all",
  _selectedId: null,
  _outsideClickBound: false,
  _dropdownAnchor: null,

  goToAtk() {
    this.closeDropdown();
    if (window.kontabilistiNavigate) window.kontabilistiNavigate("dergo-atk");
  },

  goToAtkAndGenerate(row) {
    this.closeDropdown();
    this.goToAtk();
    if (!row || row.period_type === "annual" || row.period_type === "prepayment") return;
    setTimeout(() => {
      if (!window.DergoAtkApp) return;
      DergoAtkApp.periodType = row.period_type;
      DergoAtkApp.step = 1;
      DergoAtkApp.init();
    }, 300);
  },

  statusIcon(row) {
    if (row.status === "confirmed" || row.status === "submitted") return "✅";
    if (row.urgency === "overdue") return "❌";
    if (row.urgency === "urgent") return "🔴";
    if (row.urgency === "warning") return "🟡";
    if (row.urgency === "reminder") return "🟢";
    return "⚪";
  },

  statusText(row) {
    if (row.status === "confirmed") return "Konfirmuar";
    if (row.status === "submitted") return `Dërguar${row.submitted_date ? ": " + KAPI.fmtDate(row.submitted_date) : ""}`;
    if (row.status === "overdue" || row.urgency === "overdue") return "Ende pa dërguar — i kaluar";
    return "Ende pa dërguar";
  },

  openAlerts(alerts) {
    return (alerts || [])
      .filter((a) => a.is_open !== false && a.urgency !== "ok")
      .sort((a, b) => {
        const ua = this.URGENCY_ORDER[a.urgency] ?? 5;
        const ub = this.URGENCY_ORDER[b.urgency] ?? 5;
        if (ua !== ub) return ua - ub;
        return String(a.deadline_date).localeCompare(String(b.deadline_date));
      });
  },

  urgentAlerts(alerts) {
    return this.openAlerts(alerts).filter((a) => a.urgency === "overdue" || a.urgency === "urgent");
  },

  filteredAlerts() {
    if (this._dropdownFilter === "urgent") return this.urgentAlerts(this._alertsCache);
    return this.openAlerts(this._alertsCache);
  },

  shortTitle(row) {
    const kind = row.kind_label || "Deklarata";
    const shortKind = kind.replace(/^Deklarata e /i, "").replace(/^Deklarata /i, "");
    const prefix = shortKind.toUpperCase().includes("TVSH") ? "TVSH" : shortKind.split(" ")[0];
    const period = row.period_label || "";
    if (row.urgency === "overdue" || row.days_left < 0) {
      return `${prefix} ${period} — afati ka kaluar`;
    }
    if (row.days_left === 0) return `${prefix} ${period} — skadon sot`;
    if (row.days_left === 1) return `${prefix} ${period} — skadon nesër`;
    return `${prefix} ${period} — skadon për ${row.days_left} ditë`;
  },

  rowKey(row) {
    return `${row.period_type || ""}:${row.period_start || ""}:${row.period_label || ""}`;
  },

  findRow(id) {
    return this._alertsCache.find((r) => this.rowKey(r) === id);
  },

  renderBanner(_alerts, _settings) {
    const el = document.getElementById("alert-banner");
    if (!el) return;
    el.style.display = "none";
    el.innerHTML = "";
  },

  renderPasqyraBanner(_alerts, _settings) {
    const el = document.getElementById("pasqyra-deadline-banner");
    if (!el) return;
    el.innerHTML = "";
  },

  renderBadge(openCount, alerts, settings) {
    const navBtn = document.querySelector('.nav-item[data-module="dergo-atk"]');
    this._alertsCache = alerts || [];
    this._settingsCache = settings || null;

    if (settings?.notify_badge === 0) {
      navBtn?.querySelector(".nav-deadline-badge")?.remove();
      navBtn?.classList.remove("nav-has-deadline-badge");
      return;
    }

    const openList = this.openAlerts(alerts);
    const open = Number(openCount) || openList.length;
    if (!open) {
      navBtn?.querySelector(".nav-deadline-badge")?.remove();
      navBtn?.classList.remove("nav-has-deadline-badge");
      return;
    }

    const hasUrgent = openList.some((a) => a.urgency === "urgent" || a.urgency === "overdue");
    const color = hasUrgent ? "var(--danger)" : "var(--warning)";

    if (navBtn) {
      navBtn.classList.add("nav-has-deadline-badge");
      navBtn.querySelector(".nav-deadline-badge")?.remove();
      navBtn.insertAdjacentHTML("beforeend", `<span class="nav-deadline-badge" style="background:${color}" title="Shiko njoftimet">${open}</span>`);
      navBtn.querySelector(".nav-deadline-badge")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleDropdown(navBtn, "all");
      });
    }
  },

  renderUrgentTab(alerts, settings) {
    const navBtn = document.getElementById("nav-urgent-alerts");
    if (!navBtn) return;
    this._alertsCache = alerts || this._alertsCache;
    this._settingsCache = settings || this._settingsCache;

    navBtn.querySelector(".nav-urgent-badge")?.remove();

    if (settings?.notify_badge === 0) {
      navBtn.classList.remove("nav-has-urgent-badge");
      return;
    }

    const urgentList = this.urgentAlerts(alerts);
    const count = urgentList.length;

    const openDropdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (count === 0) {
        KAPI?.toast?.("Nuk ka njoftime urgjente", false);
        return;
      }
      this.toggleDropdown(navBtn, "urgent");
    };

    navBtn.onclick = openDropdown;

    if (!count) {
      navBtn.classList.remove("nav-has-urgent-badge");
      return;
    }

    navBtn.classList.add("nav-has-urgent-badge");
    navBtn.insertAdjacentHTML("beforeend", `<span class="nav-urgent-badge" title="Njoftime urgjente">🔴${count}</span>`);
    navBtn.querySelector(".nav-urgent-badge")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openDropdown(e);
    });
  },

  toggleDropdown(anchorEl, filter = "all") {
    if (this._dropdownOpen && this._dropdownFilter === filter && this._dropdownAnchor === anchorEl) {
      this.closeDropdown();
      return;
    }
    if (this._dropdownOpen) this.closeDropdown();
    this._dropdownView = "list";
    this._selectedId = null;
    this._dropdownFilter = filter;
    this._dropdownAnchor = anchorEl;
    this.openDropdown(anchorEl, filter);
  },

  openDropdown(anchorEl, filter = "all") {
    this._dropdownFilter = filter;
    const list = filter === "urgent" ? this.urgentAlerts(this._alertsCache) : this.openAlerts(this._alertsCache);
    if (!list.length) return;

    this.closeDropdown();
    const navBtn = anchorEl || document.querySelector('.nav-item[data-module="dergo-atk"]');
    if (!navBtn) return;

    this._dropdownAnchor = navBtn;

    const dropdown = document.createElement("div");
    dropdown.id = "deadline-dropdown";
    dropdown.className = "deadline-dropdown";
    dropdown.setAttribute("role", "dialog");
    dropdown.setAttribute("aria-label", filter === "urgent" ? "Njoftime urgjente" : "Njoftimet ATK");

    document.body.appendChild(dropdown);
    this._dropdownOpen = true;
    this.renderDropdownContent(dropdown, list);
    this.positionDropdown(dropdown, navBtn);
    this.bindDropdownOutsideClose(dropdown);

    window.addEventListener("resize", this._repositionHandler = () => this.positionDropdown(dropdown, navBtn));
    window.addEventListener("scroll", this._repositionHandler, true);
  },

  positionDropdown(dropdown, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 16);
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    dropdown.style.width = `${width}px`;
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.left = `${left}px`;
  },

  bindDropdownOutsideClose(dropdown) {
    if (this._outsideClickBound) return;
    this._outsideClickHandler = (e) => {
      if (!this._dropdownOpen) return;
      const dd = document.getElementById("deadline-dropdown");
      const atkBtn = document.querySelector('.nav-item[data-module="dergo-atk"]');
      const urgentBtn = document.getElementById("nav-urgent-alerts");
      if (dd?.contains(e.target)) return;
      if (atkBtn?.contains(e.target) && e.target.closest(".nav-deadline-badge")) return;
      if (urgentBtn?.contains(e.target)) return;
      this.closeDropdown();
    };
    this._escHandler = (e) => {
      if (e.key === "Escape") this.closeDropdown();
    };
    setTimeout(() => {
      document.addEventListener("click", this._outsideClickHandler);
      document.addEventListener("keydown", this._escHandler);
      this._outsideClickBound = true;
    }, 0);
  },

  closeDropdown() {
    document.getElementById("deadline-dropdown")?.remove();
    this._dropdownOpen = false;
    this._dropdownView = "list";
    this._dropdownFilter = "all";
    this._dropdownAnchor = null;
    this._selectedId = null;
    if (this._outsideClickHandler) {
      document.removeEventListener("click", this._outsideClickHandler);
      this._outsideClickBound = false;
    }
    if (this._escHandler) document.removeEventListener("keydown", this._escHandler);
    if (this._repositionHandler) {
      window.removeEventListener("resize", this._repositionHandler);
      window.removeEventListener("scroll", this._repositionHandler, true);
    }
  },

  renderDropdownContent(dropdown, list) {
    if (this._dropdownView === "detail" && this._selectedId) {
      const row = this.findRow(this._selectedId);
      if (row) {
        dropdown.innerHTML = this.renderDropdownDetailHtml(row);
        this.bindDropdownDetailEvents(dropdown, row);
        return;
      }
      this._dropdownView = "list";
    }

    dropdown.innerHTML = this.renderDropdownListHtml(list);
    this.bindDropdownListEvents(dropdown, list);
  },

  renderDropdownListHtml(list) {
    const title = this._dropdownFilter === "urgent" ? "Njoftime Urgjente" : "Njoftimet ATK";
    return `
      <div class="deadline-dropdown-header">
        <h3>${title} <span class="deadline-dropdown-count">${list.length}</span></h3>
        <button type="button" class="deadline-dropdown-close" aria-label="Mbyll">✕</button>
      </div>
      <ul class="deadline-dropdown-list">
        ${list.map((r) => {
          const cls = this.LEVEL_CLASS[r.urgency] || "";
          const id = this.rowKey(r);
          return `<li>
            <button type="button" class="deadline-dropdown-item ${cls}" data-id="${id}">
              <span class="dl-dd-icon">${this.statusIcon(r)}</span>
              <span class="dl-dd-text">${this.shortTitle(r)}</span>
            </button>
          </li>`;
        }).join("")}
      </ul>`;
  },

  renderDropdownDetailHtml(row) {
    const msg = row.alert || {};
    const cls = this.LEVEL_CLASS[row.urgency] || "";
    const daysText = row.days_left < 0
      ? "Afati ka kaluar"
      : row.days_left === 0
        ? "Skadon sot"
        : row.days_left === 1
          ? "Skadon nesër"
          : `${row.days_left} ditë të mbetura`;

    return `
      <div class="deadline-dropdown-header">
        <button type="button" class="deadline-dropdown-back" id="dl-dd-back">← Lista</button>
        <button type="button" class="deadline-dropdown-close" aria-label="Mbyll">✕</button>
      </div>
      <div class="deadline-dropdown-detail ${cls}">
        <div class="dl-dd-detail-title">${this.statusIcon(row)} ${msg.title || row.period_label}</div>
        <div class="dl-dd-detail-meta">
          <div><strong>Periudha:</strong> ${row.period_label}</div>
          <div><strong>Lloji:</strong> ${row.kind_label || "Deklarata e TVSH-së"}</div>
          <div><strong>Afati:</strong> ${KAPI.fmtDate(row.deadline_date)}</div>
          <div><strong>Statusi:</strong> ${daysText}</div>
        </div>
        ${msg.body ? `<div class="dl-dd-detail-body">${msg.body}</div>` : ""}
        <div class="dl-dd-detail-action">
          <strong>Çka duhet bërë:</strong>
          <p>${msg.action || "Dorëzoni deklaratën te portali ATK (edi.atk-ks.org) para afatit."}</p>
        </div>
        ${row.urgency === "overdue" ? `<div class="dl-fine-info">${this.FINE_INFO_HTML}</div>` : ""}
        <div class="deadline-dropdown-detail-btns">
          <button type="button" class="btn btn-primary btn-sm" id="dl-dd-go-atk">${msg.action || "Shko te Dërgo në ATK"}</button>
          ${row.is_open && row.period_type !== "annual" && row.period_type !== "prepayment"
            ? `<button type="button" class="btn btn-secondary btn-sm" id="dl-dd-gen">Gjenero deklaratën</button>`
            : ""}
        </div>
      </div>`;
  },

  bindDropdownListEvents(dropdown, list) {
    dropdown.querySelector(".deadline-dropdown-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeDropdown();
    });
    dropdown.querySelectorAll(".deadline-dropdown-item").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._selectedId = btn.dataset.id;
        this._dropdownView = "detail";
        this.renderDropdownContent(dropdown, list);
      });
    });
  },

  bindDropdownDetailEvents(dropdown, row) {
    dropdown.querySelector(".deadline-dropdown-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeDropdown();
    });
    dropdown.querySelector("#dl-dd-back")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._dropdownView = "list";
      this._selectedId = null;
      this.renderDropdownContent(dropdown, this.filteredAlerts());
    });
    dropdown.querySelector("#dl-dd-go-atk")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.goToAtk();
    });
    dropdown.querySelector("#dl-dd-gen")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.goToAtkAndGenerate(row);
    });
  },

  /** Modal startup i hequr — njoftimet vetëm në dropdown */
  renderPopup() {},

  FINE_INFO_HTML: `<small>Sipas ligjit të ATK-së: vonesë deri 30 ditë €50–€250; mbi 30 ditë €250–€500 + kamatë; moshkontribut i përsëritur — masa shtesë.</small>`,

  renderDeadlinesPanel(rows, containerId = "deadlines-list") {
    const el = document.getElementById(containerId);
    if (!el) return;
    const sorted = [...(rows || [])].sort((a, b) => a.deadline_date.localeCompare(b.deadline_date));
    el.innerHTML = `
      <div class="deadline-panel">
        ${sorted.length ? sorted.map((r) => {
          const cls = r.is_open ? (this.LEVEL_CLASS[r.urgency] || "") : "dl-done";
          const msg = r.alert;
          return `<div class="deadline-row ${cls}">
            <div class="deadline-row-main">
              <span class="dl-icon">${this.statusIcon(r)}</span>
              <div>
                <strong>${r.period_label}</strong>
                <div class="dl-sub">${r.kind_label || ""} → Afati: ${KAPI.fmtDate(r.deadline_date)}</div>
              </div>
            </div>
            <div class="deadline-row-status">
              <span>${this.statusText(r)}</span>
              ${r.is_open && r.period_type !== "annual" && r.period_type !== "prepayment" ? `<button type="button" class="btn btn-sm btn-secondary dl-gen-btn" data-start="${r.period_start}" data-end="${r.period_end}" data-type="${r.period_type}">Gjenero →</button>` : ""}
              ${r.is_open ? `<button type="button" class="btn btn-sm btn-primary dl-go-btn">Dërgo →</button>` : ""}
            </div>
            ${r.is_open && r.urgency === "overdue" ? `<div class="dl-fine-info">${this.FINE_INFO_HTML}</div>` : ""}
            ${r.is_open && msg?.body ? `<div class="dl-alert-msg">${msg.body}</div>` : ""}
          </div>`;
        }).join("") : '<p class="empty-state">Pa afate të regjistruara</p>'}
      </div>`;

    el.querySelectorAll(".dl-go-btn").forEach((b) => b.onclick = () => this.goToAtk());
    el.querySelectorAll(".dl-gen-btn").forEach((b) => b.onclick = () => {
      this.goToAtkAndGenerate({ period_type: b.dataset.type });
    });
  },

  async refreshFromApi() {
    try {
      const dash = await KAPI.api("/dashboard");
      this.renderBanner(dash.alerts, dash.settings);
      this.renderBadge(dash.openCount, dash.alerts, dash.settings);
      this.renderUrgentTab(dash.alerts, dash.settings);
      return dash;
    } catch { return null; }
  },
};

window.DeadlineAlertsUI = DeadlineAlertsUI;
