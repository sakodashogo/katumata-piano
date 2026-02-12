-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "menuId" TEXT,
ADD COLUMN     "roomId" TEXT;

-- CreateTable
CREATE TABLE "CancellationCredit" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CancellationCredit_studentId_year_month_key" ON "CancellationCredit"("studentId", "year", "month");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationCredit" ADD CONSTRAINT "CancellationCredit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
