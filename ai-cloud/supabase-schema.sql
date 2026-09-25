-- Ekzekuto në Supabase SQL Editor (një herë)
CREATE TABLE IF NOT EXISTS kontabilisti_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT UNIQUE NOT NULL,
  business_name TEXT,
  nui TEXT,
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  scans_used INTEGER DEFAULT 0,
  scans_limit INTEGER DEFAULT 500,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kontabilisti_licenses_key ON kontabilisti_licenses (license_key);

-- Shembull licence test:
-- INSERT INTO kontabilisti_licenses (license_key, business_name, nui, scans_limit)
-- VALUES ('REV-KONT-TEST-2026', 'Test Biznesi SH.P.K.', '123456789', 100);
