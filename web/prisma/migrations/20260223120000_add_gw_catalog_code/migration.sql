-- AlterTable: add retailer-facing GW item number (XX-XX format, e.g. "48-75")
-- The gw_item_number column stores 11-digit Algolia codes (e.g. "99120101309").
-- gw_catalog_code stores the short format printed on product boxes and used by
-- all third-party retailers (Miniature Market, Discount Games Inc, etc.).
-- Populated once by scrapers/enrich_catalog_codes.py via name-matching.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gw_catalog_code" TEXT;

-- CreateIndex: unique but nullable (PostgreSQL allows multiple NULLs in a UNIQUE index)
-- IF NOT EXISTS: safe to run after enrich_catalog_codes.py which adds the column itself
CREATE UNIQUE INDEX IF NOT EXISTS "products_gw_catalog_code_key" ON "products"("gw_catalog_code");
