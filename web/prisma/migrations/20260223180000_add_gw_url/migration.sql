-- Add warhammer.com product page URL to products table
-- Populated by re-running scrapers/seed_catalog.py (ON CONFLICT DO UPDATE backfill)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gw_url" TEXT;
