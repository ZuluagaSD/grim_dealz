-- Add regional GW RRP columns for international price comparison
ALTER TABLE products ADD COLUMN IF NOT EXISTS gw_rrp_gbp NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gw_rrp_eur NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gw_rrp_aud NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gw_rrp_cad NUMERIC(10,2);

-- Add currency column to listings (existing data is all USD)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
