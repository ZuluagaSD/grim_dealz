-- AlterEnum: add 'notified' to SubscriptionStatus
-- Fired alerts get 'notified', user-initiated cancellations get 'unsubscribed'
ALTER TYPE "SubscriptionStatus" ADD VALUE 'notified';
