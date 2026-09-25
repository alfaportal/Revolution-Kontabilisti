const API = "/api";

async function api(path, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API + path, {
      ...opts,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText || "Gabim API");
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Serveri nuk përgjigjet (timeout 15s)");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function fmt(n) {
  return Number(n || 0).toLocaleString("sq-AL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "—";
  return d.split("-").reverse().join(".");
}

function toast(msg, isError, ms) {
  const el = document.createElement("div");
  el.className = "toast";
  el.style.borderColor = isError ? "var(--danger)" : "var(--success)";
  el.style.color = isError ? "var(--danger)" : "var(--success)";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms || (isError ? 4000 : 3500));
}

function emitDataChanged() {
  window.kontabilisti?.markDataDirty?.();
  window.dispatchEvent(new CustomEvent("kontabilisti:data-changed"));
}

function fieldTip(text) {
  const esc = String(text || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<span class="field-tip" title="${esc}">ℹ️</span>`;
}

function showPhotoModal(url, title = "Foto origjinale") {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay photo-view-overlay";
  overlay.innerHTML = `
    <div class="modal photo-view-modal">
      <div class="photo-view-head"><h3>${title}</h3>
        <button type="button" class="btn btn-sm btn-secondary photo-view-close">✕</button></div>
      <img src="${url}" alt="${title}" class="photo-view-img">
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".photo-view-close").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

window.KAPI = { api, fmt, fmtDate, toast, emitDataChanged, fieldTip, showPhotoModal };
