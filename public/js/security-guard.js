/**
 * Anti-debug renderer — vetëm production (ngarkohet nga index.html).
 * Pa debugger loop — shkaktonte ngecje të UI-së në Electron.
 */
(function securityGuard() {
  if (window.__KONTABILISTI_DEV__) return;

  window.addEventListener("keydown", (e) => {
    if (e.key === "F12") e.preventDefault();
    if (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) e.preventDefault();
    if (e.ctrlKey && e.key === "u") e.preventDefault();
  }, true);
})();