CREATE TABLE "TeacherWorkingHour" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeRanges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherWorkingHour_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeacherWorkingHour_dayOfWeek_key" ON "TeacherWorkingHour"("dayOfWeek");
