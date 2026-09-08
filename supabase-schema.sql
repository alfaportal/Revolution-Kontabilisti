-- Revolution Kontabilisti — Licenca (ekzekuto manualisht në Supabase)

CREATE TABLE IF NOT EXISTS licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  business_name TEXT,
  owner_name TEXT,
  phone TEXT,
  nui TEXT,
  plan TEXT DEFAULT 'standard' CHECK (plan IN ('trial', 'standard', 'premium')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  scans_used INTEGER DEFAULT 0,
  scans_limit INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 year',
  last_scan_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id UUID REFERENCES licenses(id),
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN,
  supplier_name TEXT,
  invoice_total DECIMAL(12,2)
);

CREATE INDEX IF NOT EXISTS idx_licenses_device ON licenses(device_id);
