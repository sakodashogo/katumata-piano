CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

CREATE INDEX IF NOT EXISTS "Lesson_startTime_idx" ON "Lesson"("startTime");
CREATE INDEX IF NOT EXISTS "Lesson_studentId_startTime_idx" ON "Lesson"("studentId", "startTime");
CREATE INDEX IF NOT EXISTS "Lesson_roomId_startTime_idx" ON "Lesson"("roomId", "startTime");

CREATE INDEX IF NOT EXISTS "OpenSlot_startTime_idx" ON "OpenSlot"("startTime");
CREATE INDEX IF NOT EXISTS "OpenSlot_roomId_startTime_idx" ON "OpenSlot"("roomId", "startTime");
CREATE INDEX IF NOT EXISTS "OpenSlot_isBooked_isPublic_startTime_idx" ON "OpenSlot"("isBooked", "isPublic", "startTime");
