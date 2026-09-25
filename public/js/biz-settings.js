/** Të dhënat e biznesit — i përbashkët për wizard dhe Cilësimet */
const BizSettings = (() => {
  const MUNICIPALITIES = [
    "Prishtinë", "Mitrovicë", "Pejë", "Prizren", "Ferizaj", "Gjilan", "Gjakovë",
    "Podujevë", "Vushtrri", "Suharekë", "Rahovec", "Drenas", "Lipjan", "Malishevë",
    "Kamenicë", "Viti", "Deçan", "Istog", "Klinë", "Skenderaj", "Dragash", "Fushë Kosovë",
    "Kaçanik", "Shtime", "Obiliq", "Hani i Elezit", "Mamushë", "Junik", "Kllokot",
    "Partesh", "Ranillug", "Graçanicë", "Novobërdë", "Shtërpcë", "Zubin Potok",
    "Zveçan", "Leposaviq", "Mitrovicë e Veriut",
  ];

  const BUSINESS_TYPES = ["SH.P.K.", "B.I.", "N.T.P.", "SH.A.", "O.P."];

  function esc(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function phoneDigits(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function isValidNui(nui) {
    return /^\d{9}$/.test(String(nui || "").replace(/\D/g, ""));
  }

  function isValidPersonalId(id) {
    return /^\d{10}$/.test(String(id || "").replace(/\D/g, ""));
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function validate(data) {
    const errors = [];
    const b = data || {};
    const need = (field, msg) => {
      if (!String(b[field] ?? "").trim()) errors.push(msg);
    };

    need("business_legal_name", "Emri ligjor obligativ");
    if (b.business_legal_name && String(b.business_legal_name).trim().length < 3) {
      errors.push("Emri ligjor: minimum 3 karaktere");
    }
    need("business_trade_name", "Emri tregtar obligativ");
    need("business_type", "Forma ligjore obligative");
    if (!isValidNui(b.nui)) errors.push("NUI duhet me pasë 9 shifra");
    need("fiscal_number", "Nr. Fiskal obligativ");
    need("arbk", "ARBK obligativ");
    need("registration_date", "Data e regjistrimit obligative");
    need("address", "Adresa obligative");
    need("city", "Qyteti obligativ");
    need("municipality", "Komuna obligative");
    if (b.municipality && !MUNICIPALITIES.includes(b.municipality)) {
      errors.push("Komuna duhet zgjedhur nga lista");
    }
    need("phone", "Telefoni obligativ");
    if (b.phone && phoneDigits(b.phone).length < 9) errors.push("Telefoni: minimum 9 shifra");
    need("email", "Email obligativ");
    if (b.email && !isValidEmail(b.email)) errors.push("Email i pavlefshëm");
    need("owner_name", "Emri i pronarit obligativ");
    if (!isValidPersonalId(b.owner_id_number)) errors.push("Nr. personal duhet me pasë 10 shifra");
    need("owner_phone", "Telefoni i pronarit obligativ");
    if (b.owner_phone && phoneDigits(b.owner_phone).length < 9) errors.push("Telefoni i pronarit: minimum 9 shifra");
    if (!b.declaration_period) errors.push("Periudha e deklarimit obligative");
    if (!b.fiscal_year) errors.push("Viti fiskal obligativ");

    return errors;
  }

  function validateStep(step, form) {
    const b = form || {};
    if (step === 0) {
      const e = [];
      if (!String(b.business_legal_name || "").trim()) e.push("Emri ligjor obligativ");
      else if (String(b.business_legal_name).trim().length < 3) e.push("Emri ligjor: minimum 3 karaktere");
      if (!String(b.business_trade_name || "").trim()) e.push("Emri tregtar obligativ");
      if (!String(b.business_type || "").trim()) e.push("Forma ligjore obligative");
      if (!isValidNui(b.nui)) e.push("NUI duhet me pasë 9 shifra");
      if (!String(b.fiscal_number || "").trim()) e.push("Nr. Fiskal obligativ");
      if (!String(b.arbk || "").trim()) e.push("ARBK obligativ");
      if (!String(b.registration_date || "").trim()) e.push("Data e regjistrimit obligative");
      return e;
    }
    if (step === 1) {
      const e = [];
      if (!String(b.address || "").trim()) e.push("Adresa obligative");
      if (!String(b.city || "").trim()) e.push("Qyteti obligativ");
      if (!String(b.municipality || "").trim()) e.push("Komuna obligative");
      return e;
    }
    if (step === 2) {
      const e = [];
      if (!String(b.phone || "").trim()) e.push("Telefoni obligativ");
      else if (phoneDigits(b.phone).length < 9) e.push("Telefoni: minimum 9 shifra");
      if (!String(b.email || "").trim()) e.push("Email obligativ");
      else if (!isValidEmail(b.email)) e.push("Email i pavlefshëm");
      return e;
    }
    if (step === 3) {
      const e = [];
      if (!String(b.owner_name || "").trim()) e.push("Emri i pronarit obligativ");
      if (!isValidPersonalId(b.owner_id_number)) e.push("Nr. personal duhet me pasë 10 shifra");
      if (!String(b.owner_phone || "").trim()) e.push("Telefoni i pronarit obligativ");
      else if (phoneDigits(b.owner_phone).length < 9) e.push("Telefoni i pronarit: minimum 9 shifra");
      return e;
    }
    return [];
  }

  function municipalityOptions(selected) {
    return MUNICIPALITIES.map((k) =>
      `<option value="${esc(k)}" ${selected === k ? "selected" : ""}>${esc(k)}</option>`
    ).join("");
  }

  function businessTypeOptions(selected) {
    return BUSINESS_TYPES.map((t) =>
      `<option ${selected === t ? "selected" : ""}>${t}</option>`
    ).join("");
  }

  return {
    MUNICIPALITIES,
    BUSINESS_TYPES,
    esc,
    validate,
    validateStep,
    municipalityOptions,
    businessTypeOptions,
    isValidNui,
    isValidPersonalId,
    isValidEmail,
    phoneDigits,
  };
})();

window.BizSettings = BizSettings;
