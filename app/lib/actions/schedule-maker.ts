

"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { addDays, format, getDay, setHours, setMinutes } from "date-fns"

// Types
export type ScheduleSuggestion = {
    id: string // Unique ID for keying
    slot: {
        startTime: Date
        endTime: Date
        dayOfWeek: string // "monday"
    }
    studentId: string
    matchReason: string // "Preferred Day"
    conflict: boolean
    isRecommended: boolean // New field for optimization result
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
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false, error: "Unauthorized" }
    }

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
    const allSuggestions: ScheduleSuggestion[] = []

    // Helper to check if a slot is already taken by an existing lesson
    const isSlotTaken = (slotStart: Date) => {
        return existingLessons.some(l =>
            l.startTime.getTime() === slotStart.getTime()
        )
    }

    // Checking Availability with Time Ranges
    const checkAvailability = (student: typeof students[0], slotDay: string, slotStart: Date, slotEnd: Date) => {
        const monthly = student.monthlyAvailabilities[0]
        const general = student.availabilities[0]

        // 1. Monthly Specific Slots
        if (monthly && monthly.availableSlots && Array.isArray(monthly.availableSlots) && monthly.availableSlots.length > 0) {
            return (monthly.availableSlots as string[]).some(s => new Date(s).getTime() === slotStart.getTime())
        }

        // 2. General Query (Day + Time Range)
        if (general && general.days) {
            const preferredDays = general.days as string[]
            if (!preferredDays.includes(slotDay)) return false

            // Check Time Range if exists
            if (general.startTime && general.endTime) {
                const slotTimeStr = format(slotStart, "HH:mm")
                const slotEndStr = format(slotEnd, "HH:mm")

                // Simple string comparison for HH:mm works effectively
                return slotTimeStr >= general.startTime && slotEndStr <= general.endTime
            }
            return true // Day matches, no time constraint
        }

        return false
    }

    // Generate Candidates
    for (const student of students) {
        const targetCount = student.defaultLessonCount || 4
        // Calculate remaining needed (taking existing into account)
        const currentCount = existingLessons.filter(l => l.studentId === student.id).length

        if (currentCount >= targetCount) continue

        // Check every slot
        for (const slot of teacherSlots) {
            if (isSlotTaken(slot.startTime)) continue

            if (checkAvailability(student, slot.dayOfWeek, slot.startTime, slot.endTime)) {
                allSuggestions.push({
                    id: `${student.id}-${slot.startTime.getTime()}`,
                    slot,
                    studentId: student.id,
                    matchReason: "Matched",
                    conflict: false, // Will calculate later
                    isRecommended: false // Will calculate later
                })
            }
        }
    }


    // 4. Optimization (Greedy)
    // Sort students by "scarcity" (fewer available slots -> higher priority)
    const studentScarcity = new Map<string, number>()
    for (const s of allSuggestions) {
        studentScarcity.set(s.studentId, (studentScarcity.get(s.studentId) || 0) + 1)
    }

    // Tracking for optimization
    const occupiedSlots = new Set<number>()
    const studentDailyCounts = new Map<string, Set<number>>() // studentId -> Set of Day numbers
    const studentMonthCounts = new Map<string, number>()
    const studentWeeklyCounts = new Map<string, Map<number, number>>() // studentId -> Map<WeekNum, Count>

    // Helper to get week number (simple 0-4 based on the month)
    const getWeekNumber = (date: Date) => {
        // week starts on Sunday or Monday? date-fns startOfWeek defaults to Sunday.
        // Let's use ISO week or just simple division
        const firstDayOfMonth = new Date(year, month - 1, 1)
        const dayDiff = date.getDate() - 1
        return Math.floor((dayDiff + getDay(firstDayOfMonth)) / 7)
    }

    // Initialize counts with existing lessons
    for (const l of existingLessons) {
        occupiedSlots.add(l.startTime.getTime())

        const day = l.startTime.getDate()
        if (!studentDailyCounts.has(l.studentId)) studentDailyCounts.set(l.studentId, new Set())
        studentDailyCounts.get(l.studentId)?.add(day)

        studentMonthCounts.set(l.studentId, (studentMonthCounts.get(l.studentId) || 0) + 1)

        const week = getWeekNumber(l.startTime)
        if (!studentWeeklyCounts.has(l.studentId)) studentWeeklyCounts.set(l.studentId, new Map())
        const weekCounts = studentWeeklyCounts.get(l.studentId)!
        weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
    }


    // Sort candidates
    // Priority:
    // 1. Scarcity (Least options first)
    // 2. Gap Minimization (Prefer slots adjacent to existing lessons)
    // 3. Time (Fill from start of day)

    // Let's also add "Adjacency to INITIAL existing lessons" to the static sort.
    const initialOccupied = new Set<number>()
    for (const l of existingLessons) {
        initialOccupied.add(l.startTime.getTime())
    }
    const isAdjacentToInitial = (t: number) => {
        return initialOccupied.has(t - 30 * 60000) || initialOccupied.has(t + 30 * 60000)
    }

    const sortedCandidates = [...allSuggestions].sort((a, b) => {
        // 1. Scarcity
        const scarcityA = studentScarcity.get(a.studentId) || 999
        const scarcityB = studentScarcity.get(b.studentId) || 999
        if (scarcityA !== scarcityB) return scarcityA - scarcityB

        // 2. Adjacency to INITIAL (Bonus)
        const adjA = isAdjacentToInitial(a.slot.startTime.getTime()) ? 1 : 0
        const adjB = isAdjacentToInitial(b.slot.startTime.getTime()) ? 1 : 0
        if (adjA !== adjB) return adjB - adjA // Higher score first

        // 3. Time (Ascending) - Standard packing
        return a.slot.startTime.getTime() - b.slot.startTime.getTime()
    })

    const finalRecommendations = new Set<string>()

    const processCandidates = (candidates: typeof sortedCandidates, strictDistribution: boolean) => {
        // We need to re-evaluate "Best Slot" for the high-priority students dynamically?
        // The static sort by TIME helps a lot.
        // But if we want to "Search for closure", we might need to skip ahead in the list for the SAME student?

        // For now, let's stick to the linear scan but with the improved sort.
        // The "Time" sort is the most effective simple heuristic for gap minimization (First Fit).

        for (const cand of candidates) {
            if (finalRecommendations.has(cand.id)) continue;

            // Constraints
            const slotTime = cand.slot.startTime.getTime()
            const day = cand.slot.startTime.getDate()
            const week = getWeekNumber(cand.slot.startTime)
            const student = students.find(s => s.id === cand.studentId)
            if (!student) continue

            const maxLessons = student.defaultLessonCount || 4
            const currentMonthCount = studentMonthCounts.get(cand.studentId) || 0

            // 1. Quota Check
            if (currentMonthCount >= maxLessons) continue

            // 2. Slot Occupied Check
            if (occupiedSlots.has(slotTime)) continue

            // 3. Daily Limit Check
            if (studentDailyCounts.get(cand.studentId)?.has(day)) continue

            // 4. Weekly Distribution Check
            if (strictDistribution) {
                const weekCounts = studentWeeklyCounts.get(cand.studentId)
                const currentWeekCount = weekCounts?.get(week) || 0
                // Target is roughly 1 per week for standard 4 lesson/month
                // If we allow >1, it clumps.
                if (currentWeekCount >= 1) continue
            }

            // Optimization Check:
            // If this student has OTHER candidates that are better (e.g. adjacent to just-added slot),
            // should we search for them?
            // This is complex. The Time-based sort usually handles it.

            // Accept Candidate
            finalRecommendations.add(cand.id)

            // Update State
            occupiedSlots.add(slotTime)
            if (!studentDailyCounts.has(cand.studentId)) studentDailyCounts.set(cand.studentId, new Set())
            studentDailyCounts.get(cand.studentId)?.add(day)
            studentMonthCounts.set(cand.studentId, currentMonthCount + 1)

            if (!studentWeeklyCounts.has(cand.studentId)) studentWeeklyCounts.set(cand.studentId, new Map())
            const weekCounts = studentWeeklyCounts.get(cand.studentId)!
            weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
        }
    }

    // First Pass: Strict distribution (max 1 per week)
    processCandidates(sortedCandidates, true)

    // Second Pass: Relaxed (fill remaining quota if possible)
    processCandidates(sortedCandidates, false)

    // Update suggestions with "Conflict" and "Recommended" status
    const suggestionsWithStatus = allSuggestions.map(s => {
        // Conflict = Is this slot claimed by ANY recommendation (other than self)?
        // Or simpler: Conflict = Multiple students want this slot
        const othersInSlot = allSuggestions.filter(o => o.slot.startTime.getTime() === s.slot.startTime.getTime())
        const isConflict = othersInSlot.length > 1

        return {
            ...s,
            conflict: isConflict,
            isRecommended: finalRecommendations.has(s.id)
        }
    })

    return {
        success: true,
        suggestions: suggestionsWithStatus,
        students: students.map(s => ({ id: s.id, name: s.name, defaultLessonCount: s.defaultLessonCount }))
    }
}

export async function createBulkLessons(suggestions: ScheduleSuggestion[]) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false, error: "Unauthorized" }
    }

    // Transactional creation
    try {
        await prisma.$transaction(
            suggestions.map(s => prisma.lesson.create({
                data: {
                    startTime: s.slot.startTime,
                    endTime: s.slot.endTime,
                    studentId: s.studentId,
                    type: "REGULAR",
                    status: "BOOKED"
                }
            }))
        )
        return { success: true }
    } catch (e) {
        console.error(e)
        return { success: false, error: "Failed to create lessons" }
    }
}

