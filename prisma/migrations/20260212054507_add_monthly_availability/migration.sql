-- CreateTable
CREATE TABLE "MonthlyAvailability" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "availableSlots" JSONB,
    "unavailableSlots" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAvailability_studentId_year_month_key" ON "MonthlyAvailability"("studentId", "year", "month");

-- AddForeignKey
ALTER TABLE "MonthlyAvailability" ADD CONSTRAINT "MonthlyAvailability_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
