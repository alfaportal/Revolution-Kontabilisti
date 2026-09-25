/** First-run wizard — regjistrimi obligativ i biznesit */
const BizWizard = (() => {
  let step = 0;
  let mandatory = false;
  let form = {};
  const sections = ["Ligjore", "Adresa", "Kontakti", "Pronari", "Kontabilisti", "Periudha"];

  function onComplete() {
    if (typeof BizWizard._onComplete === "function") BizWizard._onComplete();
  }

  function render() {
    const modal = document.getElementById("wizard-modal");
    const content = document.getElementById("wizard-content");
    modal.style.display = "flex";
    modal.classList.toggle("wizard-locked", mandatory);

    content.innerHTML = `
      <h2>Mirë se vini në Revolution Kontabilisti — Regjistroni biznesin tuaj</h2>
      <p class="wizard-intro">${mandatory
        ? "Plotësoni të dhënat e biznesit për të vazhduar. Kjo dritare nuk mbyllet pa regjistrim."
        : "Përditësoni të dhënat e biznesit (hapi " + (step + 1) + "/6)"}</p>
      <div class="wizard-steps">${sections.map((s, i) =>
        `<span class="wizard-step ${i === step ? "active" : i < step ? "done" : ""}">${i + 1}. ${s}</span>`
      ).join("")}</div>
      <div id="wizard-fields"></div>
      <div id="wizard-errors" class="wizard-errors" style="display:none"></div>
      <div class="wizard-actions">
        ${step > 0 ? '<button type="button" class="btn btn-secondary" id="wiz-prev">Mbrapa</button>' : ""}
        ${!mandatory ? '<button type="button" class="btn btn-secondary" id="wiz-cancel">Anulo</button>' : ""}
        <button type="button" class="btn btn-primary" id="wiz-next">${step === 5 ? "Ruaj dhe Vazhdo" : "Vazhdo"}</button>
      </div>`;

    const fields = document.getElementById("wizard-fields");
    const BS = window.BizSettings;

    if (step === 0) {
      fields.innerHTML = `
        <p class="wizard-section-title">Seksioni 1 — Të dhënat ligjore</p>
        <div class="toolbar" style="margin-bottom:12px">
          <button type="button" class="btn btn-ai-scan" id="wiz-scan-cert">📷 Skano Certifikatën ARBK</button>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Emri ligjor i biznesit *</label>
            <input id="f_legal" placeholder="Revolution Invest SH.P.K." value="${BS.esc(form.business_legal_name)}"></div>
          <div class="form-group"><label>Emri tregtar *</label>
            <input id="f_trade" placeholder="Revolution POS" value="${BS.esc(form.business_trade_name)}"></div>
          <div class="form-group"><label>Forma ligjore *</label>
            <select id="f_type">${BS.businessTypeOptions(form.business_type || "SH.P.K.")}</select></div>
          <div class="form-group"><label>NUI (9 shifra) *</label>
            <input id="f_nui" maxlength="9" inputmode="numeric" placeholder="811314567" value="${BS.esc(form.nui)}"></div>
          <div class="form-group"><label>Nr. Fiskal *</label>
            <input id="f_fiscal" value="${BS.esc(form.fiscal_number)}"></div>
          <div class="form-group"><label>ARBK (Nr. Regjistrimit) *</label>
            <input id="f_arbk" value="${BS.esc(form.arbk)}"></div>
          <div class="form-group"><label>Nr. i TVSH-së</label>
            <input id="f_vat" value="${BS.esc(form.vat_number)}" placeholder="Opsional"></div>
          <div class="form-group"><label>Data e regjistrimit *</label>
            <input type="date" id="f_regdate" value="${BS.esc(form.registration_date)}"></div>
        </div>`;
    } else if (step === 1) {
      fields.innerHTML = `
        <p class="wizard-section-title">Seksioni 2 — Adresa</p>
        <div class="form-grid">
          <div class="form-group full-width"><label>Adresa (rruga, numri) *</label>
            <input id="f_address" value="${BS.esc(form.address)}"></div>
          <div class="form-group"><label>Qyteti *</label>
            <input id="f_city" value="${BS.esc(form.city)}"></div>
          <div class="form-group"><label>Komuna *</label>
            <select id="f_municipality"><option value="">— Zgjedh —</option>${BS.municipalityOptions(form.municipality)}</select></div>
          <div class="form-group"><label>Shteti</label>
            <input value="Kosovë" disabled></div>
          <div class="form-group"><label>Kodi postar</label>
            <input id="f_postal" value="${BS.esc(form.postal_code)}"></div>
        </div>`;
    } else if (step === 2) {
      fields.innerHTML = `
        <p class="wizard-section-title">Seksioni 3 — Kontakti</p>
        <div class="form-grid">
          <div class="form-group"><label>Telefoni *</label>
            <input id="f_phone" value="${BS.esc(form.phone)}" placeholder="+383 44 000 000"></div>
          <div class="form-group"><label>Email *</label>
            <input type="email" id="f_email" value="${BS.esc(form.email)}"></div>
          <div class="form-group"><label>Ueb faqja</label>
            <input id="f_website" value="${BS.esc(form.website)}" placeholder="Opsional"></div>
        </div>`;
    } else if (step === 3) {
      fields.innerHTML = `
        <p class="wizard-section-title">Seksioni 4 — Pronari / Përfaqësuesi</p>
        <div class="form-grid">
          <div class="form-group"><label>Emri dhe mbiemri i pronarit *</label>
            <input id="f_owner" value="${BS.esc(form.owner_name)}"></div>
          <div class="form-group"><label>Nr. personal (ID) *</label>
            <input id="f_owner_id" maxlength="10" inputmode="numeric" value="${BS.esc(form.owner_id_number)}"></div>
          <div class="form-group"><label>Telefoni i pronarit *</label>
            <input id="f_owner_phone" value="${BS.esc(form.owner_phone)}"></div>
        </div>`;
    } else if (step === 4) {
      fields.innerHTML = `
        <p class="wizard-section-title">Seksioni 5 — Kontabilisti (opsional)</p>
        <div class="form-grid">
          <div class="form-group"><label>Emri i kontabilistit</label>
            <input id="f_acc" value="${BS.esc(form.accountant_name)}"></div>
          <div class="form-group"><label>Nr. i licencës</label>
            <input id="f_acc_lic" value="${BS.esc(form.accountant_license)}"></div>
          <div class="form-group"><label>Telefoni</label>
            <input id="f_acc_phone" value="${BS.esc(form.accountant_phone)}"></div>
          <div class="form-group"><label>Email</label>
            <input type="email" id="f_acc_email" value="${BS.esc(form.accountant_email)}"></div>
        </div>`;
    } else {
      fields.innerHTML = `
        <p class="wizard-section-title">Seksioni 6 — Periudha e deklarimit</p>
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Tipi i deklarimit TVSH *</label>
            <div class="radio-group">
              <label><input type="radio" name="f_period" value="monthly" ${form.declaration_period === "monthly" ? "checked" : ""}> Mujor</label>
              <label><input type="radio" name="f_period" value="quarterly" ${form.declaration_period !== "monthly" ? "checked" : ""}> Tremujor</label>
            </div>
          </div>
          <div class="form-group"><label>Viti fiskal aktual *</label>
            <input type="number" id="f_year" value="${form.fiscal_year || new Date().getFullYear()}"></div>
        </div>`;
    }

    document.getElementById("f_fiscal")?.addEventListener("blur", (e) => {
      if (!e.target.value && document.getElementById("f_nui")?.value) {
        e.target.value = document.getElementById("f_nui").value;
      }
    });

    document.getElementById("wiz-scan-cert")?.addEventListener("click", () => {
      if (!window.AiScan) return KAPI.toast("Moduli AI nuk u ngarkua", true);
      AiScan.open({
        scanType: "business_cert",
        onFillForm: (mapped) => {
          const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== "") el.value = v; };
          set("f_legal", mapped.business_legal_name);
          set("f_trade", mapped.business_trade_name || mapped.business_legal_name);
          if (mapped.business_type) set("f_type", mapped.business_type);
          set("f_nui", mapped.nui);
          set("f_fiscal", mapped.fiscal_number || mapped.nui);
          set("f_arbk", mapped.arbk);
          set("f_vat", mapped.vat_number);
          set("f_regdate", mapped.registration_date);
          Object.assign(form, {
            business_legal_name: mapped.business_legal_name || form.business_legal_name,
            business_trade_name: mapped.business_trade_name || mapped.business_legal_name || form.business_trade_name,
            business_type: mapped.business_type || form.business_type,
            nui: mapped.nui || form.nui,
            fiscal_number: mapped.fiscal_number || mapped.nui || form.fiscal_number,
            arbk: mapped.arbk || form.arbk,
            vat_number: mapped.vat_number || form.vat_number,
            registration_date: mapped.registration_date || form.registration_date,
            address: mapped.address || form.address,
            city: mapped.city || form.city,
            municipality: mapped.municipality || form.municipality,
            phone: mapped.phone || form.phone,
            email: mapped.email || form.email,
          });
        },
      });
    });

    document.getElementById("wiz-next").onclick = saveStep;
    document.getElementById("wiz-prev")?.addEventListener("click", () => { collect(); step--; render(); });
    document.getElementById("wiz-cancel")?.addEventListener("click", () => {
      document.getElementById("wizard-modal").style.display = "none";
    });
  }

  function collect() {
    const g = (id) => document.getElementById(id)?.value?.trim() || "";
    const BS = window.BizSettings;
    if (step === 0) {
      Object.assign(form, {
        business_legal_name: g("f_legal"),
        business_trade_name: g("f_trade"),
        business_type: g("f_type"),
        nui: g("f_nui").replace(/\D/g, ""),
        fiscal_number: g("f_fiscal") || g("f_nui").replace(/\D/g, ""),
        arbk: g("f_arbk"),
        vat_number: g("f_vat"),
        registration_date: g("f_regdate"),
        country: "Kosovë",
      });
    } else if (step === 1) {
      Object.assign(form, {
        address: g("f_address"),
        city: g("f_city"),
        municipality: g("f_municipality"),
        postal_code: g("f_postal"),
        country: "Kosovë",
      });
    } else if (step === 2) {
      Object.assign(form, { phone: g("f_phone"), email: g("f_email"), website: g("f_website") });
    } else if (step === 3) {
      Object.assign(form, {
        owner_name: g("f_owner"),
        owner_id_number: g("f_owner_id").replace(/\D/g, ""),
        owner_phone: g("f_owner_phone"),
      });
    } else if (step === 4) {
      Object.assign(form, {
        accountant_name: g("f_acc"),
        accountant_license: g("f_acc_lic"),
        accountant_phone: g("f_acc_phone"),
        accountant_email: g("f_acc_email"),
      });
    } else {
      const periodEl = document.querySelector('input[name="f_period"]:checked');
      Object.assign(form, {
        declaration_period: periodEl?.value || "quarterly",
        fiscal_year: Number(g("f_year")) || new Date().getFullYear(),
      });
    }
    return form;
  }

  function showErrors(errors) {
    const el = document.getElementById("wizard-errors");
    if (!el) return;
    if (!errors.length) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.innerHTML = errors.map((e) => `<p>❌ ${e}</p>`).join("");
  }

  async function saveStep() {
    collect();
    const BS = window.BizSettings;
    const stepErrors = BS.validateStep(step, form);
    if (stepErrors.length) {
      showErrors(stepErrors);
      stepErrors.forEach((e) => KAPI.toast(e, true));
      return;
    }
    showErrors([]);

    if (step < 5) {
      step++;
      render();
      return;
    }

    const allErrors = BS.validate(form);
    if (allErrors.length) {
      showErrors(allErrors);
      KAPI.toast(allErrors[0], true);
      return;
    }

    try {
      const res = await KAPI.api("/settings", { method: "PUT", body: form });
      if (!res.complete) {
        KAPI.toast("Plotësoni të gjitha fushat obligative", true);
        return;
      }
      document.getElementById("wizard-modal").style.display = "none";
      mandatory = false;
      KAPI.toast("Biznesi u regjistrua me sukses");
      KAPI.emitDataChanged();
      onComplete();
    } catch (e) {
      KAPI.toast(e.message, true);
    }
  }

  async function show(isMandatory = false, existingSettings = null) {
    mandatory = !!isMandatory;
    step = 0;
    form = existingSettings ? { ...existingSettings } : {};
    if (!form.fiscal_year) form.fiscal_year = new Date().getFullYear();
    if (!form.declaration_period) form.declaration_period = "quarterly";
    if (!form.business_type) form.business_type = "SH.P.K.";
    render();
  }

  return {
    show,
    set onComplete(fn) { BizWizard._onComplete = fn; },
    isBlocking: () => mandatory,
  };
})();
