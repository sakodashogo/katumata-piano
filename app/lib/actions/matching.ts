"use server"

import { prisma } from "@/lib/prisma"
import { addDays, startOfWeek, endOfWeek, format, parse, isSameDay } from "date-fns"

// Helper to parse "HH:mm" to minutes from midnight
function timeToMinutes(time: string) {
    const [h, m] = time.split(":").map(Number)
    return h * 60 + m
}

export async function findMatches() {
    // 1. Get all students with availability
    const availabilities = await prisma.availability.findMany({
        include: { student: true }
    })

    // 2. Get Open Slots for the "Representative Week" (e.g., next week)
    // For MVP, valid logic is:
    // - Teacher has "Open Slots" generated from GCal.
    // - Student has "Preferred Days/Times" (JSON).
    // Match = OpenSlot.startTime matches Student.preferredDay AND Student.preferredTime

    // Since OpenSlots are specific dates, we need to map them to "Day of Week".

    const today = new Date()
    const nextWeekStart = startOfWeek(addDays(today, 7), { weekStartsOn: 1 }) // Next Monday
    const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 })

    const openSlots = await prisma.openSlot.findMany({
        where: {
            startTime: {
                gte: nextWeekStart,
                lte: nextWeekEnd
            },
            isBooked: false
        },
        orderBy: { startTime: "asc" }
    })

    // 3. Algorithm
    const matches = []

    for (const slot of openSlots) {
        const slotDay = format(slot.startTime, "EEEE").toLowerCase() // "monday"
        const slotStartMin = timeToMinutes(format(slot.startTime, "HH:mm"))
        const slotEndMin = timeToMinutes(format(slot.endTime, "HH:mm"))

        const compatibleStudents = availabilities.filter(av => {
            const preferredDays = av.days as string[] // ["monday", "friday"]
            if (!preferredDays.includes(slotDay)) return false

            // Time check (Optional, if we had preferred times in JSON)
            // if (av.startTime && timeToMinutes(av.startTime) > slotStartMin) return false

            return true
        }).map(av => av.student)

        if (compatibleStudents.length > 0) {
            matches.push({
                slot,
                students: compatibleStudents
            })
        }
    }

    return { matches, openSlots }
}
