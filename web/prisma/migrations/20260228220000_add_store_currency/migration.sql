-- Add currency column to stores table
ALTER TABLE "stores" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD';

-- Set GBP for UK stores
UPDATE "stores" SET "currency" = 'GBP' WHERE "slug" IN ('element-games', 'wayland-games');
