

"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { addDays, format, getDay, setHours, setMinutes } from "date-fns"
import { getSupportShiftsInRangeSafe } from "@/lib/support-shifts"

// Types
export type ScheduleSuggestion = {
    id: string // Unique ID for keying
    slot: {
        startTime: Date
        endTime: Date
        dayOfWeek: string // "monday"
        roomId: string
    }
    studentId: string
    matchReason: string // "Preferred Day"
    conflict: boolean
    isRecommended: boolean // New field for optimization result
}

export type LockedAssignment = {
    studentId: string
    startTime: string | Date
    endTime: string | Date
    roomId: string
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
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
                        dayOfWeek: format(current, "EEEE").toLowerCase(),
                        roomId: "A",
                    })
                }
            }
        }
        current = addDays(current, 1)
    }
    return slots
}

export async function generateSuggestedSchedule(
    year: number,
    month: number,
    options?: { lockedAssignments?: LockedAssignment[] }
) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false, error: "Unauthorized" }
    }

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59)

    // 1. Fetch Data
    const [students, existingLessons, supportShifts] = await Promise.all([
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
        }),
        getSupportShiftsInRangeSafe(start, end),
    ])
    const typedSupportShifts = supportShifts as Array<{ startTime: Date; endTime: Date }>

    const existingExactKey = new Set(
        existingLessons.map((lesson) => `${lesson.studentId}__${lesson.startTime.getTime()}__${lesson.roomId || "A"}`)
    )
    const lockedAssignments = (options?.lockedAssignments || [])
        .map((locked) => ({
            studentId: locked.studentId,
            roomId: locked.roomId === "B" ? "B" : "A",
            startTime: new Date(locked.startTime),
            endTime: new Date(locked.endTime),
        }))
        .filter((locked) =>
            !Number.isNaN(locked.startTime.getTime()) &&
            !Number.isNaN(locked.endTime.getTime()) &&
            locked.endTime > locked.startTime &&
            locked.startTime >= start &&
            locked.startTime <= end
        )
        .filter((locked) => !existingExactKey.has(`${locked.studentId}__${locked.startTime.getTime()}__${locked.roomId}`))

    const lockedSuggestions: ScheduleSuggestion[] = lockedAssignments.map((locked) => ({
        id: `locked-${locked.studentId}-${locked.roomId}-${locked.startTime.getTime()}`,
        slot: {
            startTime: locked.startTime,
            endTime: locked.endTime,
            dayOfWeek: format(locked.startTime, "EEEE").toLowerCase(),
            roomId: locked.roomId,
        },
        studentId: locked.studentId,
        matchReason: "Manual Lock",
        conflict: false,
        isRecommended: true,
    }))

    const lockedSlotKeys = new Set(
        lockedAssignments.map((locked) => `${locked.startTime.getTime()}__${locked.roomId}`)
    )

    // 2. Generate All Possible Teacher Slots
    const teacherSlotsA = generateTeacherSlots(year, month)
    const teacherSlotsB = teacherSlotsA.filter((slot) =>
        typedSupportShifts.some((shift) => shift.startTime < slot.endTime && shift.endTime > slot.startTime)
    ).map((slot) => ({ ...slot, roomId: "B" }))
    const teacherSlots = [...teacherSlotsA, ...teacherSlotsB]

    // 3. Matching Logic
    const allSuggestions: ScheduleSuggestion[] = []

    // Helper to check if a slot is already taken by an existing lesson
    const isSlotTaken = (slotStart: Date, roomId: string) => {
        return existingLessons.some(l =>
            l.startTime.getTime() === slotStart.getTime() && (l.roomId || "A") === roomId
        ) || lockedSlotKeys.has(`${slotStart.getTime()}__${roomId}`)
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
            if (isSlotTaken(slot.startTime, slot.roomId)) continue

            if (checkAvailability(student, slot.dayOfWeek, slot.startTime, slot.endTime)) {
                allSuggestions.push({
                    id: `${student.id}-${slot.roomId}-${slot.startTime.getTime()}`,
                    slot,
                    studentId: student.id,
                    matchReason: "Matched",
                    conflict: false, // Will calculate later
                    isRecommended: false // Will calculate later
                })
            }
        }
    }


    // 4. Optimization (Greedy with weekday fixation + weekly distribution + gap minimization)
    const studentById = new Map(students.map((student) => [student.id, student]))
    const studentScarcity = new Map<string, number>()
    for (const suggestion of allSuggestions) {
        studentScarcity.set(suggestion.studentId, (studentScarcity.get(suggestion.studentId) || 0) + 1)
    }

    const occupiedSlots = new Set<string>()
    const studentDailyCounts = new Map<string, Set<number>>()
    const studentMonthCounts = new Map<string, number>()
    const studentWeeklyCounts = new Map<string, Map<number, number>>()

    const getWeekNumber = (date: Date) => {
        const firstDayOfMonth = new Date(year, month - 1, 1)
        const dayDiff = date.getDate() - 1
        return Math.floor((dayDiff + getDay(firstDayOfMonth)) / 7)
    }

    for (const lesson of existingLessons) {
        occupiedSlots.add(`${lesson.startTime.getTime()}__${lesson.roomId || "A"}`)
        const day = lesson.startTime.getDate()
        if (!studentDailyCounts.has(lesson.studentId)) studentDailyCounts.set(lesson.studentId, new Set())
        studentDailyCounts.get(lesson.studentId)?.add(day)
        studentMonthCounts.set(lesson.studentId, (studentMonthCounts.get(lesson.studentId) || 0) + 1)

        const week = getWeekNumber(lesson.startTime)
        if (!studentWeeklyCounts.has(lesson.studentId)) studentWeeklyCounts.set(lesson.studentId, new Map())
        const weekCounts = studentWeeklyCounts.get(lesson.studentId)!
        weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
    }

    for (const locked of lockedAssignments) {
        occupiedSlots.add(`${locked.startTime.getTime()}__${locked.roomId}`)
        const day = locked.startTime.getDate()
        if (!studentDailyCounts.has(locked.studentId)) studentDailyCounts.set(locked.studentId, new Set())
        studentDailyCounts.get(locked.studentId)?.add(day)
        studentMonthCounts.set(locked.studentId, (studentMonthCounts.get(locked.studentId) || 0) + 1)

        const week = getWeekNumber(locked.startTime)
        if (!studentWeeklyCounts.has(locked.studentId)) studentWeeklyCounts.set(locked.studentId, new Map())
        const weekCounts = studentWeeklyCounts.get(locked.studentId)!
        weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
    }

    const getMode = (values: number[]) => {
        const counts = new Map<number, number>()
        for (const value of values) {
            counts.set(value, (counts.get(value) || 0) + 1)
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
        return sorted[0]?.[0]
    }

    const preferredWeekdayByStudent = new Map<string, number>()
    for (const student of students) {
        const existingDays = existingLessons
            .filter((lesson) => lesson.studentId === student.id)
            .map((lesson) => getDay(lesson.startTime))
        if (existingDays.length > 0) {
            const mode = getMode(existingDays)
            if (mode !== undefined) preferredWeekdayByStudent.set(student.id, mode)
            continue
        }

        const candidateDays = allSuggestions
            .filter((suggestion) => suggestion.studentId === student.id)
            .map((suggestion) => getDay(suggestion.slot.startTime))
        const candidateMode = getMode(candidateDays)
        if (candidateMode !== undefined) preferredWeekdayByStudent.set(student.id, candidateMode)
    }

    const initialOccupied = new Set<string>()
    for (const lesson of existingLessons) {
        initialOccupied.add(`${lesson.startTime.getTime()}__${lesson.roomId || "A"}`)
    }
    for (const locked of lockedAssignments) {
        initialOccupied.add(`${locked.startTime.getTime()}__${locked.roomId}`)
    }
    const isAdjacentToInitial = (time: number, roomId: string) =>
        initialOccupied.has(`${time - 30 * 60000}__${roomId}`) || initialOccupied.has(`${time + 30 * 60000}__${roomId}`)

    const sortedCandidates = [...allSuggestions].sort((a, b) => {
        const scarcityA = studentScarcity.get(a.studentId) || 999
        const scarcityB = studentScarcity.get(b.studentId) || 999
        if (scarcityA !== scarcityB) return scarcityA - scarcityB

        const preferredA = preferredWeekdayByStudent.get(a.studentId)
        const preferredB = preferredWeekdayByStudent.get(b.studentId)
        const fixedA = preferredA !== undefined && preferredA === getDay(a.slot.startTime) ? 1 : 0
        const fixedB = preferredB !== undefined && preferredB === getDay(b.slot.startTime) ? 1 : 0
        if (fixedA !== fixedB) return fixedB - fixedA

        const adjA = isAdjacentToInitial(a.slot.startTime.getTime(), a.slot.roomId) ? 1 : 0
        const adjB = isAdjacentToInitial(b.slot.startTime.getTime(), b.slot.roomId) ? 1 : 0
        if (adjA !== adjB) return adjB - adjA

        return a.slot.startTime.getTime() - b.slot.startTime.getTime()
    })

    const finalRecommendations = new Set<string>()

    const canAssign = (candidate: ScheduleSuggestion, strictDistribution: boolean) => {
        const slotTime = candidate.slot.startTime.getTime()
        const occupiedKey = `${slotTime}__${candidate.slot.roomId}`
        const day = candidate.slot.startTime.getDate()
        const week = getWeekNumber(candidate.slot.startTime)
        const student = studentById.get(candidate.studentId)
        if (!student) return false

        const maxLessons = student.defaultLessonCount || 4
        const currentMonthCount = studentMonthCounts.get(candidate.studentId) || 0
        if (currentMonthCount >= maxLessons) return false
        if (occupiedSlots.has(occupiedKey)) return false
        if (studentDailyCounts.get(candidate.studentId)?.has(day)) return false

        if (strictDistribution) {
            const currentWeekCount = studentWeeklyCounts.get(candidate.studentId)?.get(week) || 0
            if (currentWeekCount >= 1) return false
        }

        return true
    }

    const scoreCandidate = (candidate: ScheduleSuggestion, strictDistribution: boolean) => {
        const slotTime = candidate.slot.startTime.getTime()
        const roomId = candidate.slot.roomId
        const week = getWeekNumber(candidate.slot.startTime)
        const preferredDay = preferredWeekdayByStudent.get(candidate.studentId)
        const dayOfWeek = getDay(candidate.slot.startTime)
        const weekCount = studentWeeklyCounts.get(candidate.studentId)?.get(week) || 0
        const adjacentBefore = occupiedSlots.has(`${slotTime - 30 * 60000}__${roomId}`) ? 1 : 0
        const adjacentAfter = occupiedSlots.has(`${slotTime + 30 * 60000}__${roomId}`) ? 1 : 0
        const adjacentCount = adjacentBefore + adjacentAfter
        const closesGap = adjacentCount === 2 ? 1 : 0
        const fixedWeekday = preferredDay !== undefined && preferredDay === dayOfWeek ? 1 : 0

        return (
            fixedWeekday * 100 +
            closesGap * 40 +
            adjacentCount * 20 -
            weekCount * (strictDistribution ? 50 : 20) -
            candidate.slot.startTime.getTime() / 10_000_000_000
        )
    }

    const acceptCandidate = (candidate: ScheduleSuggestion) => {
        const slotTime = candidate.slot.startTime.getTime()
        const occupiedKey = `${slotTime}__${candidate.slot.roomId}`
        const day = candidate.slot.startTime.getDate()
        const week = getWeekNumber(candidate.slot.startTime)
        const currentMonthCount = studentMonthCounts.get(candidate.studentId) || 0

        finalRecommendations.add(candidate.id)
        occupiedSlots.add(occupiedKey)
        if (!studentDailyCounts.has(candidate.studentId)) studentDailyCounts.set(candidate.studentId, new Set())
        studentDailyCounts.get(candidate.studentId)?.add(day)
        studentMonthCounts.set(candidate.studentId, currentMonthCount + 1)
        if (!studentWeeklyCounts.has(candidate.studentId)) studentWeeklyCounts.set(candidate.studentId, new Map())
        const weekCounts = studentWeeklyCounts.get(candidate.studentId)!
        weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
    }

    const studentOrder = students
        .map((student) => student.id)
        .sort((a, b) => (studentScarcity.get(a) || 999) - (studentScarcity.get(b) || 999))

    const processCandidates = (strictDistribution: boolean) => {
        for (const studentId of studentOrder) {
            while (true) {
                const pool = sortedCandidates
                    .filter((candidate) => candidate.studentId === studentId && !finalRecommendations.has(candidate.id))
                    .filter((candidate) => canAssign(candidate, strictDistribution))

                if (pool.length === 0) break

                pool.sort((a, b) => {
                    const scoreDiff = scoreCandidate(b, strictDistribution) - scoreCandidate(a, strictDistribution)
                    if (scoreDiff !== 0) return scoreDiff
                    return a.slot.startTime.getTime() - b.slot.startTime.getTime()
                })

                acceptCandidate(pool[0])
            }
        }
    }

    processCandidates(true)
    processCandidates(false)

    for (const candidate of sortedCandidates) {
        if (finalRecommendations.has(candidate.id)) continue
        if (!canAssign(candidate, false)) continue
        acceptCandidate(candidate)
    }

    // Update suggestions with "Conflict" and "Recommended" status
    const combinedSuggestions = [...lockedSuggestions, ...allSuggestions]
    const lockedIds = new Set(lockedSuggestions.map((suggestion) => suggestion.id))
    const suggestionsWithStatus = combinedSuggestions.map((s) => {
        const isRecommended = lockedIds.has(s.id) || finalRecommendations.has(s.id)
        const othersInSlot = combinedSuggestions.filter((o) =>
            o.id !== s.id &&
            o.slot.startTime.getTime() === s.slot.startTime.getTime() &&
            o.slot.roomId === s.slot.roomId
        )
        // Recommended suggestions are already de-duplicated by slot in the optimizer.
        const isConflict = !isRecommended && othersInSlot.length > 0

        return {
            ...s,
            conflict: isConflict,
            isRecommended
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
                    status: "BOOKED",
                    roomId: s.slot.roomId,
                }
            }))
        )
        return { success: true }
    } catch (e) {
        console.error(e)
        return { success: false, error: "Failed to create lessons" }
    }
}

