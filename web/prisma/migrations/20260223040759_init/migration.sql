-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('standard', 'battleforce', 'combat_patrol', 'paint', 'codex', 'terrain');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('in_stock', 'out_of_stock', 'backorder', 'pre_order', 'limited');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gw_item_number" TEXT NOT NULL,
    "faction" TEXT NOT NULL,
    "game_system" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "product_type" "ProductType" NOT NULL DEFAULT 'standard',
    "gw_rrp_usd" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'US',
    "affiliate_tag" TEXT,
    "affiliate_network" TEXT,
    "commission_pct" DECIMAL(4,2),
    "typical_discount_pct" DECIMAL(4,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "store_product_url" TEXT,
    "store_sku" TEXT,
    "current_price" DECIMAL(10,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL,
    "in_stock" BOOLEAN NOT NULL DEFAULT true,
    "stock_status" "StockStatus" NOT NULL DEFAULT 'in_stock',
    "affiliate_url" TEXT,
    "last_scraped" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL,
    "in_stock" BOOLEAN NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "click_events" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "click_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_gw_item_number_key" ON "products"("gw_item_number");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE INDEX "listings_product_id_idx" ON "listings"("product_id");

-- CreateIndex
CREATE INDEX "listings_store_id_idx" ON "listings"("store_id");

-- CreateIndex
CREATE INDEX "listings_discount_pct_idx" ON "listings"("discount_pct");

-- CreateIndex
CREATE INDEX "listings_in_stock_idx" ON "listings"("in_stock");

-- CreateIndex
CREATE INDEX "listings_last_checked_at_idx" ON "listings"("last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "listings_product_id_store_id_key" ON "listings"("product_id", "store_id");

-- CreateIndex
CREATE INDEX "price_history_listing_id_idx" ON "price_history"("listing_id");

-- CreateIndex
CREATE INDEX "price_history_scraped_at_idx" ON "price_history"("scraped_at");

-- CreateIndex
CREATE INDEX "click_events_listing_id_idx" ON "click_events"("listing_id");

-- CreateIndex
CREATE INDEX "click_events_clicked_at_idx" ON "click_events"("clicked_at");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
