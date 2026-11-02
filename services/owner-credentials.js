const bcrypt = require("bcryptjs");
const db = require("./supabase");

const mockOwners = [];

function isMissingUsersTable(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || error?.details || "");
  return (
    code === "42P01"
    || code === "PGRST205"
    || /could not find the table|relation .*users.* does not exist|schema cache/i.test(msg)
  );
}

function usersMissingError() {
  return new Error("Tabela users mungon. Ekzekutoni sql/users.sql në Supabase Kontabilisti.");
}

function sanitizeOwner(row) {
  if (!row) return row;
  const { passwordi, ...safe } = row;
  return safe;
}

async function patchLicenseEmail(licenseId, mail, emri) {
  const row = { owner_email: mail };
  if (emri) row.owner_name = emri;
  try {
    await db.updateLicenseById(licenseId, row);
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (/owner_email|column/i.test(msg)) {
      if (emri) await db.updateLicenseById(licenseId, { owner_name: emri });
      return;
    }
    if (/Nuk ka fusha/i.test(msg)) return;
    throw e;
  }
}

async function setOwnerPasswordForClient(clientId, password, { email, emri } = {}) {
  const pw = String(password || "").trim();
  if (pw.length < 6) throw new Error("Fjalëkalimi min. 6 karaktere.");
  const cid = String(clientId || "").trim();
  if (!cid) throw new Error("Mungon ID e klientit.");

  const license = await db.findById(cid);
  if (!license) throw new Error("Klienti / licenca nuk u gjet.");

  const mail = (email != null ? String(email).trim().toLowerCase() : "")
    || String(license.owner_email || license.email || "").trim().toLowerCase();
  if (!mail) throw new Error("Vendos email të klientit para se të vendosësh fjalëkalimin.");
  const name = String(emri || license.owner_name || license.business_name || "Pronar").trim();
  const hash = await bcrypt.hash(pw, 12);
  const now = new Date().toISOString();

  await patchLicenseEmail(cid, mail, name);

  if (db.useMock()) {
    const existing = mockOwners.filter((o) => o.client_id === cid);
    if (existing.length) {
      for (const o of existing) {
        o.email = mail;
        o.emri = name;
        o.passwordi = hash;
        o.password_set_at = now;
      }
      return { owners: existing.map(sanitizeOwner), created: false, product_line: "kontabilisti" };
    }
    const created = {
      id: require("crypto").randomUUID(),
      client_id: cid,
      emri: name,
      email: mail,
      roli: "client_admin",
      passwordi: hash,
      password_set_at: now,
    };
    mockOwners.push(created);
    return { owners: [sanitizeOwner(created)], created: true, product_line: "kontabilisti" };
  }

  const sb = db.getClient();
  const { data: owners, error: uErr } = await sb
    .from("users")
    .select("id, emri, email, roli, client_id")
    .eq("client_id", cid)
    .eq("roli", "client_admin");
  if (uErr) {
    if (isMissingUsersTable(uErr)) throw usersMissingError();
    throw uErr;
  }

  if (owners && owners.length) {
    const updated = [];
    for (const o of owners) {
      const patch = { passwordi: hash, password_set_at: now, email: mail, emri: name };
      let { data, error } = await sb
        .from("users")
        .update(patch)
        .eq("id", o.id)
        .eq("roli", "client_admin")
        .select("id, emri, email, roli, client_id")
        .single();
      if (error && /password_set_at|aktiv/i.test(error.message || "")) {
        delete patch.password_set_at;
        ({ data, error } = await sb
          .from("users")
          .update(patch)
          .eq("id", o.id)
          .eq("roli", "client_admin")
          .select("id, emri, email, roli, client_id")
          .single());
      }
      if (error) throw error;
      updated.push(sanitizeOwner(data));
    }
    return { owners: updated, created: false, product_line: "kontabilisti" };
  }

  const row = {
    client_id: cid,
    emri: name,
    email: mail,
    roli: "client_admin",
    aktiv: true,
    passwordi: hash,
    password_set_at: now,
  };
  let { data: created, error: insErr } = await sb
    .from("users")
    .insert(row)
    .select("id, emri, email, roli, client_id")
    .single();
  if (insErr && /aktiv|password_set_at/i.test(insErr.message || "")) {
    delete row.aktiv;
    delete row.password_set_at;
    ({ data: created, error: insErr } = await sb
      .from("users")
      .insert(row)
      .select("id, emri, email, roli, client_id")
      .single());
  }
  if (insErr) {
    if (isMissingUsersTable(insErr)) throw usersMissingError();
    throw insErr;
  }
  return { owners: [sanitizeOwner(created)], created: true, product_line: "kontabilisti" };
}

async function setOwnerEmailForClient(clientId, email, { emri } = {}) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) throw new Error("Email është i detyrueshëm.");
  const cid = String(clientId || "").trim();
  if (!cid) throw new Error("Mungon ID e klientit.");

  const license = await db.findById(cid);
  if (!license) throw new Error("Klienti / licenca nuk u gjet.");
  const name = emri != null ? String(emri).trim() : "";
  await patchLicenseEmail(cid, mail, name || undefined);

  if (db.useMock()) {
    const existing = mockOwners.filter((o) => o.client_id === cid);
    if (!existing.length) {
      throw new Error("Nuk ka llogari pronari për këtë klient. Vendos email + fjalëkalim së pari.");
    }
    for (const o of existing) {
      o.email = mail;
      if (name) o.emri = name;
    }
    return { owners: existing.map(sanitizeOwner), client_email: mail, product_line: "kontabilisti" };
  }

  const sb = db.getClient();
  const { data: owners, error: uErr } = await sb
    .from("users")
    .select("id, emri, email, roli, client_id")
    .eq("client_id", cid)
    .eq("roli", "client_admin");
  if (uErr) {
    if (isMissingUsersTable(uErr)) throw usersMissingError();
    throw uErr;
  }
  if (!owners || !owners.length) {
    throw new Error("Nuk ka llogari pronari për këtë klient. Vendos email + fjalëkalim së pari.");
  }
  const updated = [];
  for (const o of owners) {
    const patch = { email: mail };
    if (name) patch.emri = name;
    const { data, error } = await sb
      .from("users")
      .update(patch)
      .eq("id", o.id)
      .eq("roli", "client_admin")
      .select("id, emri, email, roli, client_id")
      .single();
    if (error) throw error;
    updated.push(sanitizeOwner(data));
  }
  return { owners: updated, client_email: mail, product_line: "kontabilisti" };
}

module.exports = {
  setOwnerPasswordForClient,
  setOwnerEmailForClient,
};
