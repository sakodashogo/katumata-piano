-- CreateEnum
CREATE TYPE "MenuCategory" AS ENUM ('REGULAR', 'PRACTICE', 'SOLO_ADDITIONAL', 'DUET_ADDITIONAL', 'OTHER');

-- AlterTable
ALTER TABLE "Menu"
ADD COLUMN "category" "MenuCategory" NOT NULL DEFAULT 'OTHER';

-- Backfill existing menus based on current naming rules
UPDATE "Menu"
SET "category" = 'PRACTICE'
WHERE "category" = 'OTHER'
  AND ("name" ILIKE '%自主練%' OR "name" ILIKE '%practice%');

UPDATE "Menu"
SET "category" = 'SOLO_ADDITIONAL'
WHERE "category" = 'OTHER'
  AND ("name" ILIKE '%ソロ%' OR "name" ILIKE '%solo%');

UPDATE "Menu"
SET "category" = 'DUET_ADDITIONAL'
WHERE "category" = 'OTHER'
  AND ("name" ILIKE '%連弾%' OR "name" ILIKE '%duet%');

UPDATE "Menu"
SET "category" = 'REGULAR'
WHERE "category" = 'OTHER'
  AND ("name" ILIKE '%通常%' OR "name" ILIKE '%regular%');

-- CreateTable
CREATE TABLE "MonthlySchedulePublication" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySchedulePublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySchedulePublication_year_month_key" ON "MonthlySchedulePublication"("year", "month");

-- AddForeignKey
ALTER TABLE "MonthlySchedulePublication"
ADD CONSTRAINT "MonthlySchedulePublication_publishedBy_fkey"
FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
