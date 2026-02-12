
"use server"

import { prisma } from "@/lib/prisma"
import { addDays, startOfWeek, endOfWeek, format, parse, isSameDay, getDay, setHours, setMinutes } from "date-fns"

// Types
export type ScheduleSuggestion = {
    slot: {
        startTime: Date
        endTime: Date
        dayOfWeek: string // "monday"
    }
    studentId: string
    matchReason: string // "Preferred Day"
    conflict: boolean
    existingLesson?: boolean
}

// Teacher Working Hours: Mon-Sat 14:00 - 20:00
const WORKING_HOUR_START = 14
const WORKING_HOUR_END = 20
const WORKING_DAYS = [1, 2, 3, 4, 5, 6] // Mon-Sat (0 is Sunday)

// Helper to generate teacher slots for a given month
function generateTeacherSlots(year: number, month: number) {
    const slots = []
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0)

    let current = start
    while (current <= end) {
        const day = getDay(current)
        if (WORKING_DAYS.includes(day)) {
            // Generate 30-min slots from 14:00 to 20:00
            for (let h = WORKING_HOUR_START; h < WORKING_HOUR_END; h++) {
                for (let m = 0; m < 60; m += 30) {
                    const slotStart = setMinutes(setHours(current, h), m)
                    const slotEnd = setMinutes(setHours(current, h), m + 30)
                    slots.push({
                        startTime: slotStart,
                        endTime: slotEnd,
                        dayOfWeek: format(current, "EEEE").toLowerCase()
                    })
                }
            }
        }
        current = addDays(current, 1)
    }
    return slots
}

export async function generateSuggestedSchedule(year: number, month: number) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59)

    // 1. Fetch Data
    const [students, existingLessons] = await Promise.all([
        prisma.user.findMany({
            where: { role: "STUDENT" },
            include: {
                monthlyAvailabilities: {
                    where: { year, month },
                    orderBy: { createdAt: "desc" },
                    take: 1
                },
                availabilities: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                }
            }
        }),
        prisma.lesson.findMany({
            where: {
                startTime: { gte: start, lte: end },
                status: { not: "CANCELLED" }
            }
        })
    ])

    // 2. Generate All Possible Teacher Slots
    const teacherSlots = generateTeacherSlots(year, month)

    // 3. Matching Logic
    const suggestions: ScheduleSuggestion[] = []

    // Helper to check if a slot is already taken by an existing lesson
    const isSlotTaken = (slotStart: Date) => {
        return existingLessons.some(l =>
            l.startTime.getTime() === slotStart.getTime()
        )
    }

    // Helper to check student availability
    // Priority: MonthlyAvailability > General Availability
    const checkAvailability = (student: typeof students[0], slotDay: string, slotStart: Date) => {
        const monthly = student.monthlyAvailabilities[0]
        const general = student.availabilities[0]

        // If Monthly Availability exists with specific slots (JSON)
        // Note: The schema has `availableSlots` as Json. Assuming it's an array of ISO strings?
        // Or if it's empty, maybe check `days` in General Availability?

        // Let's assume for now we use General Availability `days` matching,
        // unless Monthly explicit slots are provided.
        // If Monthly has `availableSlots` (specific dates), we match specific dates.

        if (monthly && monthly.availableSlots && Array.isArray(monthly.availableSlots) && monthly.availableSlots.length > 0) {
            // Check specific slots
            const slotIso = slotStart.toISOString()
            // Loose matching might be needed for timezone issues, but strictly:
            // Assuming FE sends ISO strings.
            return (monthly.availableSlots as string[]).some(s => new Date(s).getTime() === slotStart.getTime())
        }

        // Fallback to General Availability Days
        if (general && general.days) {
            const preferredDays = general.days as string[]
            return preferredDays.includes(slotDay)
        }

        return false // No availability info
    }

    // Iterate students and try to fill their quota
    for (const student of students) {
        let assignedCount = existingLessons.filter(l => l.studentId === student.id).length
        const targetCount = student.defaultLessonCount || 4

        if (assignedCount >= targetCount) continue

        // Find matches
        for (const slot of teacherSlots) {
            if (assignedCount >= targetCount) break

            // Check if slot is taken by ANY existing lesson (Teacher busy)
            if (isSlotTaken(slot.startTime)) continue

            // Check if student matches
            if (checkAvailability(student, slot.dayOfWeek, slot.startTime)) {
                // Check if we already suggested this slot for this student
                if (suggestions.some(s => s.studentId === student.id && s.slot.startTime.getTime() === slot.startTime.getTime())) continue

                // Check conflict with other suggestions?
                // For "Generative" mode, we might want to reserve it.
                // But for "Heatmap" mode, we want to show overlaps.
                // Let's add it as a "Potential" match.

                // For MVP: We want to show conflicts. So we add it.
                // But we flag it if another student also claims it.

                const isConflict = suggestions.some(s => s.slot.startTime.getTime() === slot.startTime.getTime())

                suggestions.push({
                    slot,
                    studentId: student.id,
                    matchReason: "Matched Preference",
                    conflict: isConflict
                })

                // If we want to be greedy and "book" it for this student in this loop:
                // assignedCount++ 
                // But this hides conflicts. 
                // Let's NOT increment assignedCount based on suggestions, 
                // so we find ALL potential slots for the student?
                // No, we want to find "Best" slots.

                // compromise: Find up to targetCount * 2 potential slots? 
                // Or just all valid slots?
                // Let's return ALL valid slots for the heatmap.
            }
        }
    }

    return {
        success: true,
        suggestions,
        students: students.map(s => ({ id: s.id, name: s.name, defaultLessonCount: s.defaultLessonCount }))
    }
}
