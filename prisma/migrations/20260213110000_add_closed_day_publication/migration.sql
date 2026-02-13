-- CreateTable
CREATE TABLE IF NOT EXISTS "ClosedDay" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosedDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClosedDay_date_idx" ON "ClosedDay"("date");
CREATE UNIQUE INDEX IF NOT EXISTS "ClosedDay_date_startTime_endTime_key" ON "ClosedDay"("date", "startTime", "endTime");

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClosedDayPublication" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosedDayPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClosedDayPublication_year_month_key" ON "ClosedDayPublication"("year", "month");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PublishedClosedDay" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishedClosedDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PublishedClosedDay_date_idx" ON "PublishedClosedDay"("date");
CREATE UNIQUE INDEX IF NOT EXISTS "PublishedClosedDay_publicationId_date_startTime_endTime_key" ON "PublishedClosedDay"("publicationId", "date", "startTime", "endTime");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ClosedDayPublication_publishedBy_fkey'
    ) THEN
        ALTER TABLE "ClosedDayPublication"
        ADD CONSTRAINT "ClosedDayPublication_publishedBy_fkey"
        FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'PublishedClosedDay_publicationId_fkey'
    ) THEN
        ALTER TABLE "PublishedClosedDay"
        ADD CONSTRAINT "PublishedClosedDay_publicationId_fkey"
        FOREIGN KEY ("publicationId") REFERENCES "ClosedDayPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill existing closed-day records as already published by month.
WITH month_groups AS (
    SELECT DISTINCT
        EXTRACT(YEAR FROM "date")::INTEGER AS "year",
        EXTRACT(MONTH FROM "date")::INTEGER AS "month"
    FROM "ClosedDay"
)
INSERT INTO "ClosedDayPublication" (
    "id",
    "year",
    "month",
    "publishedAt",
    "publishedBy",
    "createdAt",
    "updatedAt"
)
SELECT
    format('closed_pub_%s_%s', mg."year", mg."month"),
    mg."year",
    mg."month",
    NOW(),
    NULL,
    NOW(),
    NOW()
FROM month_groups mg
ON CONFLICT ("year", "month") DO NOTHING;

INSERT INTO "PublishedClosedDay" (
    "id",
    "publicationId",
    "date",
    "startTime",
    "endTime",
    "reason",
    "createdAt",
    "updatedAt"
)
SELECT
    format('published_closed_%s', cd."id"),
    cdp."id",
    cd."date",
    cd."startTime",
    cd."endTime",
    cd."reason",
    NOW(),
    NOW()
FROM "ClosedDay" cd
INNER JOIN "ClosedDayPublication" cdp
    ON cdp."year" = EXTRACT(YEAR FROM cd."date")::INTEGER
    AND cdp."month" = EXTRACT(MONTH FROM cd."date")::INTEGER
ON CONFLICT ("publicationId", "date", "startTime", "endTime") DO NOTHING;
