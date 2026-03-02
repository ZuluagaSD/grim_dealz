-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'miniature';
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'box_set';
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'book';
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'accessory';
