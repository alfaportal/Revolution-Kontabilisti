-- ═══════════════════════════════════════════════════════════
-- Revolution Kontabilisti — Licencat AI
-- Ekzekuto në Supabase SQL Editor (një herë, para deploy)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kontabilisti_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT UNIQUE NOT NULL,
  business_name TEXT,
  nui TEXT,
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  device_id TEXT,
  activated_at TIMESTAMPTZ,
  max_devices INTEGER DEFAULT 1,
  scans_used INTEGER DEFAULT 0,
  scans_limit INTEGER DEFAULT 500,
  last_scan_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kontabilisti_licenses_key
  ON kontabilisti_licenses (license_key);

CREATE INDEX IF NOT EXISTS idx_kontabilisti_licenses_nui
  ON kontabilisti_licenses (nui);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION kontabilisti_licenses_set_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kontabilisti_licenses_updated ON kontabilisti_licenses;
CREATE TRIGGER trg_kontabilisti_licenses_updated
  BEFORE UPDATE ON kontabilisti_licenses
  FOR EACH ROW EXECUTE FUNCTION kontabilisti_licenses_set_updated();

-- ═══ Shembull licence (ndrysho para prod) ═══
-- INSERT INTO kontabilisti_licenses (license_key, business_name, nui, scans_limit, expires_at)
-- VALUES (
--   'REV-KONT-2026-DEMO01',
--   'Demo Biznesi SH.P.K.',
--   '123456789',
--   500,
--   '2027-12-31T23:59:59Z'
-- );
