const API = "/api/admin";
const KEY = "rev_kont_admin_key";

function getKey() { return sessionStorage.getItem(KEY) || ""; }
function setKey(k) { sessionStorage.setItem(KEY, k); }
function clearKey() { sessionStorage.removeItem(KEY); }

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": getKey(),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Gabim API");
  return data;
}

function showLogin() {
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("app-view").classList.add("hidden");
}

function showApp() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");
}

async function renderDashboard() {
  const el = document.getElementById("main-content");
  el.innerHTML = "<p>Duke ngarkuar...</p>";
  const [dash, lic] = await Promise.all([
    api("/dashboard"),
    api("/licenses"),
  ]);

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="val">${dash.active_licenses}</div><div class="lbl">Licenca aktive</div></div>
      <div class="kpi"><div class="val">${dash.scans_today}</div><div class="lbl">Skane sot</div></div>
      <div class="kpi"><div class="val">${dash.scans_month}</div><div class="lbl">Skane muajin</div></div>
      <div class="kpi"><div class="val">${dash.total_licenses}</div><div class="lbl">Totali</div></div>
    </div>
    <button class="btn btn-primary" id="btn-new" style="margin-bottom:16px">+ Licencë e Re</button>
    <h3 style="margin:0 0 12px">📋 Licencat</h3>
    <div id="license-list">${renderLicenseList(lic.licenses)}</div>
    <div id="create-form" class="hidden"></div>`;

  document.getElementById("btn-new").onclick = () => showCreateForm();
  bindLicenseActions();
}

function renderLicenseList(rows) {
  if (!rows?.length) return '<p style="color:#999">Pa licenca ende</p>';
  return rows.map((l) => `
    <div class="card" data-device="${l.device_id}">
      <strong>${esc(l.business_name || "—")}</strong>
      ${l.owner_name ? `<div style="color:#999;font-size:0.85rem">${esc(l.owner_name)}</div>` : ""}
      <div style="font-size:0.85rem;margin-top:8px;color:#bbb">
        Device: <code>${esc(l.device_id)}</code><br>
        NUI: ${esc(l.nui || "—")} · Tel: ${esc(l.phone || "—")}<br>
        Skane: ${l.scans_used}/${l.scans_limit} · Skadon: ${l.expires_at || "—"}<br>
        <span class="${l.status === "active" ? "status-active" : "status-suspended"}">${l.status === "active" ? "✅ Aktive" : "❌ " + l.status}</span>
      </div>
      <div class="license-actions">
        ${l.status === "active"
    ? `<button class="btn btn-secondary btn-sm" data-act="deactivate" data-dev="${l.device_id}">Çaktivizo</button>
           <button class="btn btn-secondary btn-sm" data-act="renew" data-dev="${l.device_id}">Rinovoje</button>`
    : `<button class="btn btn-secondary btn-sm" data-act="activate" data-dev="${l.device_id}">Aktivizo</button>`}
        <button class="btn btn-secondary btn-sm" data-act="add_scans" data-dev="${l.device_id}">+500 skane</button>
      </div>
    </div>`).join("");
}

function showCreateForm() {
  const box = document.getElementById("create-form");
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3>+ Licencë e Re</h3>
      <label>Device ID *</label>
      <input id="c_device" placeholder="XXXX-XXXX-XXXX-XXXX">
      <label>Emri biznesit</label>
      <input id="c_biz">
      <label>Pronari</label>
      <input id="c_owner">
      <label>Telefoni</label>
      <input id="c_phone" placeholder="+38344123456">
      <label>NUI</label>
      <input id="c_nui" maxlength="9">
      <label>Plani</label>
      <div class="plan-options">
        <label><input type="radio" name="plan" value="trial"> Trial (30 ditë, 50 sk.)</label>
        <label><input type="radio" name="plan" value="standard" checked> Standard (1 vit, 500)</label>
        <label><input type="radio" name="plan" value="premium"> Premium (1 vit, 2000)</label>
      </div>
      <button class="btn btn-primary" id="c_submit" style="margin-top:12px">KRIJO DHE AKTIVIZO</button>
      <button class="btn btn-secondary" id="c_cancel" style="margin-top:8px">Anulo</button>
    </div>`;
  document.getElementById("c_cancel").onclick = () => { box.classList.add("hidden"); box.innerHTML = ""; };
  document.getElementById("c_submit").onclick = async () => {
    const plan = document.querySelector('input[name="plan"]:checked')?.value || "standard";
    try {
      await api("/license/create", {
        method: "POST",
        body: {
          device_id: document.getElementById("c_device").value.trim(),
          business_name: document.getElementById("c_biz").value.trim(),
          owner_name: document.getElementById("c_owner").value.trim(),
          phone: document.getElementById("c_phone").value.trim(),
          nui: document.getElementById("c_nui").value.trim(),
          plan,
        },
      });
      alert("Licenca u krijua!");
      await renderDashboard();
    } catch (e) { alert(e.message); }
  };
}

function bindLicenseActions() {
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = async () => {
      const action = btn.dataset.act;
      const device_id = btn.dataset.dev;
      let value;
      if (action === "add_scans") value = 500;
      try {
        await api("/license/update", { method: "POST", body: { device_id, action, value } });
        await renderDashboard();
      } catch (e) { alert(e.message); }
    };
  });
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

document.getElementById("btn-login").onclick = async () => {
  const pass = document.getElementById("admin-pass").value;
  setKey(pass);
  try {
    await api("/dashboard");
    showApp();
    await renderDashboard();
  } catch {
    clearKey();
    const err = document.getElementById("login-err");
    err.style.display = "block";
    err.textContent = "Fjalëkalim i gabuar";
  }
};

document.getElementById("btn-logout").onclick = () => {
  clearKey();
  showLogin();
};

if (getKey()) {
  api("/dashboard").then(() => { showApp(); renderDashboard(); }).catch(showLogin);
} else {
  showLogin();
}
