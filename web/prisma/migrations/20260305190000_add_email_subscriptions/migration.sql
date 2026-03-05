-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('pending', 'active', 'unsubscribed', 'bounced');

-- CreateTable
CREATE TABLE "email_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verify_token" TEXT NOT NULL,
    "unsubscribe_token" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "target_price" DECIMAL(10,2),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'pending',
    "last_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscriptions" (
    "id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_subscribers_email_key" ON "email_subscribers"("email");
CREATE UNIQUE INDEX "email_subscribers_verify_token_key" ON "email_subscribers"("verify_token");
CREATE UNIQUE INDEX "email_subscribers_unsubscribe_token_key" ON "email_subscribers"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "price_alerts_product_id_idx" ON "price_alerts"("product_id");
CREATE INDEX "price_alerts_status_idx" ON "price_alerts"("status");
CREATE UNIQUE INDEX "price_alerts_subscriber_id_product_id_key" ON "price_alerts"("subscriber_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_subscriber_id_key" ON "newsletter_subscriptions"("subscriber_id");

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "email_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_subscriptions" ADD CONSTRAINT "newsletter_subscriptions_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "email_subscribers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
