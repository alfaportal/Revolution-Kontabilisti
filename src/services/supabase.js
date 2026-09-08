const { createClient } = require("@supabase/supabase-js");
const { config } = require("../config");

let client = null;

function getSupabase() {
  if (client) return client;
  if (!config.supabase.url || !config.supabase.serviceKey) {
    throw new Error("Supabase nuk është konfiguruar — vendos SUPABASE_URL dhe SUPABASE_SERVICE_ROLE_KEY");
  }
  client = createClient(config.supabase.url, config.supabase.serviceKey);
  return client;
}

function table() {
  return getSupabase().from(config.supabase.licenseTable);
}

module.exports = { getSupabase, table };
