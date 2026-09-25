/**
 * Aktivizimi — vetëm dialogu Electron i errët (main process).
 * Mos përdor modal HTML të dyfishtë.
 */
const LicenseActivation = {
  async needsActivation() {
    try {
      const st = await KAPI.api("/license/status");
      return !st.active;
    } catch {
      return true;
    }
  },

  async show() {
    if (window.kontabilisti?.openLicenseDialog) {
      const r = await window.kontabilisti.openLicenseDialog();
      return { activated: !!(r && r.active), data: r };
    }
    KAPI.toast("Aktivizimi kërkon aplikacionin desktop (Electron).", true);
    return { activated: false };
  },

  close(activated, data) {
    return { activated, data };
  },

  isBlocking() {
    return false;
  },
};

window.LicenseActivation = LicenseActivation;
