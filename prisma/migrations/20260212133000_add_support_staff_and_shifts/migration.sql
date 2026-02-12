-- AlterTable
ALTER TABLE "Lesson"
ADD COLUMN "assignedStaffId" TEXT;

-- CreateTable
CREATE TABLE "SupportStaff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportShift" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportShift_startTime_endTime_idx" ON "SupportShift"("startTime", "endTime");

-- AddForeignKey
ALTER TABLE "Lesson"
ADD CONSTRAINT "Lesson_assignedStaffId_fkey"
FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportShift"
ADD CONSTRAINT "SupportShift_staffId_fkey"
FOREIGN KEY ("staffId") REFERENCES "SupportStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

