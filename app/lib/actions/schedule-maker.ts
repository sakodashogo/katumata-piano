"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { addDays, format, getDay, setHours, setMinutes } from "date-fns"
import { getSupportShiftsInRangeSafe } from "@/lib/support-shifts"
import { getClosedDaysInRangeSafe, isSlotClosed } from "@/lib/closed-days"

// Types
type LessonTypeValue = "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL" | null | undefined
type SuggestionLessonType = Exclude<LessonTypeValue, null | undefined>

export type ScheduleSuggestion = {
    id: string // Unique ID for keying
    slot: {
        startTime: Date
        endTime: Date
        dayOfWeek: string // "monday"
        roomId: string
    }
    studentId: string
    type: SuggestionLessonType
    matchReason: string // "Preferred Day"
    conflict: boolean
    isRecommended: boolean // New field for optimization result
}

export type ScheduleSuggestionDiagnosticReasonCode =
    | "TARGET_MET"
    | "DAILY_CAP_LIMIT"
    | "NO_CANDIDATE"
    | "SCHEDULE_CONFLICT"

export type ScheduleSuggestionDiagnostic = {
    studentId: string
    targetRegularCount: number
    currentRegularCount: number
    maxPossibleRegularCount: number
    shortage: number
    reasonCode: ScheduleSuggestionDiagnosticReasonCode
    reasonText: string
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
const SLOT_DURATION_MINUTES = 30
const SLOT_DURATION_MS = SLOT_DURATION_MINUTES * 60 * 1000
const MAX_LESSONS_PER_DAY = 1
const ANCHOR_NEARBY_MAX_MINUTES = 60
const ANCHOR_NEARBY_HIGH_BAND_MINUTES = 30

type GeneratedSlot = {
    startTime: Date
    endTime: Date
    dayOfWeek: string
    roomId: string
}

type Interval = { start: number; end: number }

type StudentAnchor = {
    dayOfWeek: number
    minuteOfDay: number
    source: "previous-month" | "default-preference"
}

// Helper to generate teacher slots for a given month
function generateTeacherSlots(year: number, month: number) {
    const slots: GeneratedSlot[] = []
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

function getWeekNumberInMonth(year: number, month: number, date: Date) {
    const firstDayOfMonth = new Date(year, month - 1, 1)
    const dayDiff = date.getDate() - 1
    return Math.floor((dayDiff + getDay(firstDayOfMonth)) / 7)
}

function getDateKey(date: Date) {
    return format(date, "yyyy-MM-dd")
}

function toMinuteOfDay(date: Date) {
    return date.getHours() * 60 + date.getMinutes()
}

function parseHHMMToMinuteOfDay(value: string | null | undefined) {
    if (!value) return null
    const [hourRaw, minuteRaw] = value.split(":")
    const hour = Number(hourRaw)
    const minute = Number(minuteRaw)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return hour * 60 + minute
}

function dayNameToIndex(value: string | null | undefined) {
    if (!value) return null
    const normalized = value.toLowerCase()
    const mapping: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
    }
    return mapping[normalized] ?? null
}

function getWeeklyCap(defaultLessonCount: number, weekCountInMonth: number) {
    if (defaultLessonCount === 4) return 1
    if (defaultLessonCount === 8) return 2
    return Math.max(1, Math.ceil(defaultLessonCount / Math.max(weekCountInMonth, 1)))
}

function normalizeLessonType(type: LessonTypeValue) {
    return type ?? "REGULAR"
}

function isContractCountType(type: LessonTypeValue) {
    return normalizeLessonType(type) === "REGULAR"
}

function hasIntervalOverlap(intervals: Interval[] | undefined, start: number, end: number) {
    if (!intervals || intervals.length === 0) return false
    return intervals.some((interval) => interval.start < end && interval.end > start)
}

function addInterval(intervalMap: Map<string, Interval[]>, roomId: string, start: number, end: number) {
    const list = intervalMap.get(roomId) ?? []
    list.push({ start, end })
    list.sort((a, b) => a.start - b.start)
    intervalMap.set(roomId, list)
}

function addGlobalInterval(intervals: Interval[], start: number, end: number) {
    intervals.push({ start, end })
    intervals.sort((a, b) => a.start - b.start)
}

function getContiguity(intervals: Interval[] | undefined, start: number, end: number) {
    if (!intervals || intervals.length === 0) return { before: false, after: false }
    let before = false
    let after = false
    for (const interval of intervals) {
        if (interval.end === start) before = true
        if (interval.start === end) after = true
    }
    return { before, after }
}

function getFragmentationPenalty(intervals: Interval[] | undefined, start: number, end: number, durationMs: number) {
    if (!intervals || intervals.length === 0) return 0
    let prev: Interval | null = null
    let next: Interval | null = null
    const startDateKey = getDateKey(new Date(start))
    for (const interval of intervals) {
        if (getDateKey(new Date(interval.start)) !== startDateKey) continue
        if (interval.end <= start && (!prev || interval.end > prev.end)) prev = interval
        if (interval.start >= end && (!next || interval.start < next.start)) next = interval
    }
    let penalty = 0
    if (prev) {
        const gapBefore = start - prev.end
        if (gapBefore > 0 && gapBefore < durationMs) penalty += 1
    }
    if (next) {
        const gapAfter = next.start - end
        if (gapAfter > 0 && gapAfter < durationMs) penalty += 1
    }
    return penalty
}

export async function generateSuggestedSchedule(
    year: number,
    month: number,
    options?: { lockedAssignments?: LockedAssignment[]; overrideStudentIds?: string[] }
) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false, error: "Unauthorized" }
    }

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59)
    const previousStart = new Date(year, month - 2, 1)
    const previousEnd = new Date(year, month - 1, 0, 23, 59, 59)
    const overriddenStudentIds = new Set(options?.overrideStudentIds || [])

    // 1. Fetch Data
    const [students, existingLessons, previousMonthLessons, supportShifts, closedDays] = await Promise.all([
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
                status: { not: "CANCELLED" },
                ...(overriddenStudentIds.size > 0
                    ? { studentId: { notIn: Array.from(overriddenStudentIds) } }
                    : {}),
            }
        }),
        prisma.lesson.findMany({
            where: {
                startTime: { gte: previousStart, lte: previousEnd },
                status: { not: "CANCELLED" }
            },
            select: {
                studentId: true,
                startTime: true,
            }
        }),
        getSupportShiftsInRangeSafe(start, end),
        getClosedDaysInRangeSafe(start, end),
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
            type: normalizeLessonType(locked.type),
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
        type: locked.type,
        matchReason: "Manual Lock",
        conflict: false,
        isRecommended: true,
    }))

    const lockedSlotKeys = new Set(
        lockedAssignments.map((locked) => `${locked.startTime.getTime()}__${locked.roomId}`)
    )

    // 2. Generate All Possible Teacher Slots (filter out closed periods)
    const teacherSlotsA = generateTeacherSlots(year, month).filter(
        (slot) => !isSlotClosed(closedDays, slot.startTime, slot.endTime)
    )
    const teacherSlotsB = teacherSlotsA.filter((slot) =>
        typedSupportShifts.some((shift) => shift.startTime < slot.endTime && shift.endTime > slot.startTime)
    ).map((slot) => ({ ...slot, roomId: "B" }))
    const teacherSlots = [...teacherSlotsA, ...teacherSlotsB]
    const supportSlotStartSet = new Set(teacherSlotsB.map((slot) => slot.startTime.getTime()))

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

    const existingContractCountByStudent = new Map<string, number>()
    for (const lesson of existingLessons) {
        if (!isContractCountType(lesson.type)) continue
        existingContractCountByStudent.set(lesson.studentId, (existingContractCountByStudent.get(lesson.studentId) || 0) + 1)
    }

    const lockedContractCountByStudent = new Map<string, number>()
    for (const locked of lockedAssignments) {
        if (!isContractCountType(locked.type)) continue
        lockedContractCountByStudent.set(locked.studentId, (lockedContractCountByStudent.get(locked.studentId) || 0) + 1)
    }

    // Generate Candidates
    for (const student of students) {
        const targetCount = student.defaultLessonCount || 4
        const currentCount =
            (existingContractCountByStudent.get(student.id) || 0) +
            (lockedContractCountByStudent.get(student.id) || 0)

        if (currentCount >= targetCount) continue

        // Check every slot
        for (const slot of teacherSlots) {
            if (isSlotTaken(slot.startTime, slot.roomId)) continue

            if (checkAvailability(student, slot.dayOfWeek, slot.startTime, slot.endTime)) {
                allSuggestions.push({
                    id: `${student.id}-${slot.roomId}-${slot.startTime.getTime()}`,
                    slot,
                    studentId: student.id,
                    type: "REGULAR",
                    matchReason: "Matched",
                    conflict: false, // Will calculate later
                    isRecommended: false // Will calculate later
                })
            }
        }
    }

    // 4. Optimizer (Pass 1: A/B pairing -> Pass 2: weekly cap on -> Pass 3: weekly cap relaxed)
    const studentById = new Map(students.map((student) => [student.id, student]))
    const studentScarcity = new Map<string, number>() // lower means fewer candidate days
    const candidateDaySetByStudent = new Map<string, Set<string>>()
    for (const suggestion of allSuggestions) {
        const dateKey = getDateKey(suggestion.slot.startTime)
        if (!candidateDaySetByStudent.has(suggestion.studentId)) {
            candidateDaySetByStudent.set(suggestion.studentId, new Set())
        }
        candidateDaySetByStudent.get(suggestion.studentId)?.add(dateKey)
    }
    for (const student of students) {
        studentScarcity.set(student.id, candidateDaySetByStudent.get(student.id)?.size || 0)
    }

    const weekIndexSet = new Set<number>()
    for (let day = 1; day <= end.getDate(); day++) {
        weekIndexSet.add(getWeekNumberInMonth(year, month, new Date(year, month - 1, day)))
    }
    const weekCountInMonth = weekIndexSet.size

    const studentDailyAssignments = new Map<string, Set<string>>()
    const studentMonthCounts = new Map<string, number>()
    const studentWeeklyCounts = new Map<string, Map<number, number>>()
    const roomIntervals = new Map<string, Interval[]>()
    const globalIntervals: Interval[] = []

    for (const lesson of existingLessons) {
        const roomId = lesson.roomId || "A"
        addInterval(roomIntervals, roomId, lesson.startTime.getTime(), lesson.endTime.getTime())
        addGlobalInterval(globalIntervals, lesson.startTime.getTime(), lesson.endTime.getTime())
        const dateKey = getDateKey(lesson.startTime)
        if (!studentDailyAssignments.has(lesson.studentId)) studentDailyAssignments.set(lesson.studentId, new Set())
        studentDailyAssignments.get(lesson.studentId)?.add(dateKey)
        if (isContractCountType(lesson.type)) {
            studentMonthCounts.set(lesson.studentId, (studentMonthCounts.get(lesson.studentId) || 0) + 1)
            const week = getWeekNumberInMonth(year, month, lesson.startTime)
            if (!studentWeeklyCounts.has(lesson.studentId)) studentWeeklyCounts.set(lesson.studentId, new Map())
            const weekCounts = studentWeeklyCounts.get(lesson.studentId)!
            weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
        }
    }

    for (const locked of lockedAssignments) {
        addInterval(roomIntervals, locked.roomId, locked.startTime.getTime(), locked.endTime.getTime())
        addGlobalInterval(globalIntervals, locked.startTime.getTime(), locked.endTime.getTime())
        const dateKey = getDateKey(locked.startTime)
        if (!studentDailyAssignments.has(locked.studentId)) studentDailyAssignments.set(locked.studentId, new Set())
        studentDailyAssignments.get(locked.studentId)?.add(dateKey)
        if (isContractCountType(locked.type)) {
            studentMonthCounts.set(locked.studentId, (studentMonthCounts.get(locked.studentId) || 0) + 1)
            const week = getWeekNumberInMonth(year, month, locked.startTime)
            if (!studentWeeklyCounts.has(locked.studentId)) studentWeeklyCounts.set(locked.studentId, new Map())
            const weekCounts = studentWeeklyCounts.get(locked.studentId)!
            weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
        }
    }

    const getModeFromNumberList = (values: number[]) => {
        const countMap = new Map<number, number>()
        for (const value of values) {
            countMap.set(value, (countMap.get(value) || 0) + 1)
        }
        const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1])
        return sorted[0]?.[0]
    }

    const getModeFromStringList = (values: string[]) => {
        const countMap = new Map<string, number>()
        for (const value of values) {
            countMap.set(value, (countMap.get(value) || 0) + 1)
        }
        const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1])
        return sorted[0]?.[0]
    }

    const studentAnchors = new Map<string, StudentAnchor>()

    for (const student of students) {
        const previousPatterns = previousMonthLessons
            .filter((lesson) => lesson.studentId === student.id)
            .map((lesson) => `${getDay(lesson.startTime)}__${toMinuteOfDay(lesson.startTime)}`)
        const previousMode = getModeFromStringList(previousPatterns)
        if (previousMode) {
            const [dayRaw, minuteRaw] = previousMode.split("__")
            const dayOfWeek = Number(dayRaw)
            const minuteOfDay = Number(minuteRaw)
            if (Number.isFinite(dayOfWeek) && Number.isFinite(minuteOfDay)) {
                studentAnchors.set(student.id, {
                    dayOfWeek,
                    minuteOfDay,
                    source: "previous-month",
                })
                continue
            }
        }

        const general = student.availabilities[0]
        const preferredDays = Array.isArray(general?.days) ? (general?.days as string[]) : []
        const dayFromGeneral = getModeFromNumberList(
            preferredDays
                .map((dayName) => dayNameToIndex(dayName))
                .filter((day): day is number => day !== null)
        )
        const minuteFromGeneral = parseHHMMToMinuteOfDay(general?.startTime)
        if (dayFromGeneral !== undefined && minuteFromGeneral !== null) {
            studentAnchors.set(student.id, {
                dayOfWeek: dayFromGeneral,
                minuteOfDay: minuteFromGeneral,
                source: "default-preference",
            })
        }
    }

    const getTargetRegularCount = (studentId: string) => studentById.get(studentId)?.defaultLessonCount || 4
    const getRemainingNeed = (studentId: string) =>
        Math.max(0, getTargetRegularCount(studentId) - (studentMonthCounts.get(studentId) || 0))
    const getStudentPriorityOrder = () => {
        return students
            .map((student) => student.id)
            .sort((leftId, rightId) => {
                const leftNeed = getRemainingNeed(leftId)
                const rightNeed = getRemainingNeed(rightId)
                if (leftNeed !== rightNeed) return rightNeed - leftNeed

                const leftScarcity = studentScarcity.get(leftId) ?? 999
                const rightScarcity = studentScarcity.get(rightId) ?? 999
                if (leftScarcity !== rightScarcity) return leftScarcity - rightScarcity

                const leftTarget = getTargetRegularCount(leftId)
                const rightTarget = getTargetRegularCount(rightId)
                if (leftTarget !== rightTarget) return rightTarget - leftTarget

                return leftId.localeCompare(rightId)
            })
    }

    const finalRecommendations = new Set<string>()

    const canAssignHard = (candidate: ScheduleSuggestion, options?: { ignoreWeeklyCap?: boolean }) => {
        const student = studentById.get(candidate.studentId)
        if (!student) return false

        const targetMonthlyCount = getTargetRegularCount(candidate.studentId)
        const currentMonthlyCount = studentMonthCounts.get(candidate.studentId) || 0
        if (currentMonthlyCount >= targetMonthlyCount) return false

        const dateKey = getDateKey(candidate.slot.startTime)
        const currentDailySet = studentDailyAssignments.get(candidate.studentId)
        if ((currentDailySet?.has(dateKey) ?? false) && MAX_LESSONS_PER_DAY <= 1) return false

        if (!options?.ignoreWeeklyCap) {
            const weekIndex = getWeekNumberInMonth(year, month, candidate.slot.startTime)
            const weeklyCap = getWeeklyCap(targetMonthlyCount, weekCountInMonth)
            const currentWeekCount = studentWeeklyCounts.get(candidate.studentId)?.get(weekIndex) || 0
            if (currentWeekCount >= weeklyCap) return false
        }

        const roomId = candidate.slot.roomId
        const startTime = candidate.slot.startTime.getTime()
        const endTime = candidate.slot.endTime.getTime()
        if (hasIntervalOverlap(roomIntervals.get(roomId), startTime, endTime)) return false

        return true
    }

    const isAnchorExact = (anchor: StudentAnchor | undefined, slotStart: Date) => {
        if (!anchor) return false
        return getDay(slotStart) === anchor.dayOfWeek && toMinuteOfDay(slotStart) === anchor.minuteOfDay
    }

    const scoreCandidate = (candidate: ScheduleSuggestion, hasExactAnchorInPool: boolean) => {
        const student = studentById.get(candidate.studentId)
        if (!student) return Number.NEGATIVE_INFINITY

        let score = 0
        const targetRegularCount = getTargetRegularCount(candidate.studentId)
        const currentRegularCount = studentMonthCounts.get(candidate.studentId) || 0
        const remainingNeed = Math.max(0, targetRegularCount - currentRegularCount)
        const weekIndex = getWeekNumberInMonth(year, month, candidate.slot.startTime)
        const weekCount = studentWeeklyCounts.get(candidate.studentId)?.get(weekIndex) || 0
        const anchor = studentAnchors.get(candidate.studentId)
        const candidateMinute = toMinuteOfDay(candidate.slot.startTime)
        const candidateDay = getDay(candidate.slot.startTime)

        score += remainingNeed * 130

        // Preference heuristic: keep anchor timing, but lower priority than teacher-time minimization.
        if (anchor && candidateDay === anchor.dayOfWeek) {
            const delta = Math.abs(candidateMinute - anchor.minuteOfDay)
            if (delta === 0) {
                score += 320
            } else if (delta <= ANCHOR_NEARBY_MAX_MINUTES && !hasExactAnchorInPool) {
                score += 230 - delta * 2
                if (delta <= ANCHOR_NEARBY_HIGH_BAND_MINUTES) score += 50
            } else if (delta <= ANCHOR_NEARBY_MAX_MINUTES) {
                score += 40
            }
        }
        if (anchor?.source === "previous-month") score += 20

        // Keep weekly spread as hard tie-breaker under normal pass.
        score -= weekCount * 170

        // Teacher idle minimization.
        const roomId = candidate.slot.roomId
        const startMs = candidate.slot.startTime.getTime()
        const endMs = candidate.slot.endTime.getTime()
        const intervals = roomIntervals.get(roomId)
        const contiguity = getContiguity(intervals, startMs, endMs)
        const adjacentCount = (contiguity.before ? 1 : 0) + (contiguity.after ? 1 : 0)
        score += adjacentCount * 170
        if (adjacentCount === 2) score += 90

        const globalOverlap = hasIntervalOverlap(globalIntervals, startMs, endMs)
        if (globalOverlap) score += 760
        else score -= 620

        const globalContiguity = getContiguity(globalIntervals, startMs, endMs)
        const globalAdjacentCount = (globalContiguity.before ? 1 : 0) + (globalContiguity.after ? 1 : 0)
        score += globalAdjacentCount * 260
        if (globalAdjacentCount === 2) score += 140

        const oppositeRoomId = roomId === "B" ? "A" : "B"
        const oppositeRoomOverlap = hasIntervalOverlap(roomIntervals.get(oppositeRoomId), startMs, endMs)
        if (oppositeRoomOverlap) {
            score += 300
            if (supportSlotStartSet.has(startMs)) {
                score += 480
            }
        } else if (supportSlotStartSet.has(startMs) && roomId === "B") {
            score += 110
        }

        const fragmentationPenalty = getFragmentationPenalty(intervals, startMs, endMs, SLOT_DURATION_MS)
        score -= fragmentationPenalty * 160
        const globalFragmentationPenalty = getFragmentationPenalty(globalIntervals, startMs, endMs, SLOT_DURATION_MS)
        score -= globalFragmentationPenalty * 260
        if (!globalOverlap && globalAdjacentCount === 0) score -= 220

        score -= candidate.slot.startTime.getTime() / 10_000_000_000
        return score
    }

    const acceptCandidate = (candidate: ScheduleSuggestion) => {
        const studentId = candidate.studentId
        const dateKey = getDateKey(candidate.slot.startTime)
        const weekIndex = getWeekNumberInMonth(year, month, candidate.slot.startTime)
        const roomId = candidate.slot.roomId
        const startMs = candidate.slot.startTime.getTime()
        const endMs = candidate.slot.endTime.getTime()

        finalRecommendations.add(candidate.id)
        addInterval(roomIntervals, roomId, startMs, endMs)
        addGlobalInterval(globalIntervals, startMs, endMs)

        if (!studentDailyAssignments.has(studentId)) studentDailyAssignments.set(studentId, new Set())
        studentDailyAssignments.get(studentId)?.add(dateKey)

        if (isContractCountType(candidate.type)) {
            studentMonthCounts.set(studentId, (studentMonthCounts.get(studentId) || 0) + 1)
            if (!studentWeeklyCounts.has(studentId)) studentWeeklyCounts.set(studentId, new Map())
            const weekly = studentWeeklyCounts.get(studentId)!
            weekly.set(weekIndex, (weekly.get(weekIndex) || 0) + 1)
        }
    }

    const candidatePoolByStudent = new Map<string, ScheduleSuggestion[]>()
    const candidatePoolBySlotRoom = new Map<string, ScheduleSuggestion[]>()
    for (const suggestion of allSuggestions) {
        const list = candidatePoolByStudent.get(suggestion.studentId) || []
        list.push(suggestion)
        candidatePoolByStudent.set(suggestion.studentId, list)

        const slotRoomKey = `${suggestion.slot.startTime.getTime()}__${suggestion.slot.roomId}`
        const slotRoomList = candidatePoolBySlotRoom.get(slotRoomKey) || []
        slotRoomList.push(suggestion)
        candidatePoolBySlotRoom.set(slotRoomKey, slotRoomList)
    }

    // Pass 1: prioritize support-time A/B simultaneous placement.
    const supportSlotStartTimes = Array.from(supportSlotStartSet).sort((a, b) => a - b)
    for (const slotStartMs of supportSlotStartTimes) {
        const slotEndMs = slotStartMs + SLOT_DURATION_MS
        if (hasIntervalOverlap(roomIntervals.get("A"), slotStartMs, slotEndMs)) continue
        if (hasIntervalOverlap(roomIntervals.get("B"), slotStartMs, slotEndMs)) continue

        const poolA = (candidatePoolBySlotRoom.get(`${slotStartMs}__A`) || [])
            .filter((candidate) => !finalRecommendations.has(candidate.id))
            .filter((candidate) => canAssignHard(candidate))
        const poolB = (candidatePoolBySlotRoom.get(`${slotStartMs}__B`) || [])
            .filter((candidate) => !finalRecommendations.has(candidate.id))
            .filter((candidate) => canAssignHard(candidate))

        if (poolA.length === 0 || poolB.length === 0) continue

        const hasExactAnchorA = new Set<string>()
        for (const candidate of poolA) {
            const anchor = studentAnchors.get(candidate.studentId)
            if (isAnchorExact(anchor, candidate.slot.startTime)) hasExactAnchorA.add(candidate.studentId)
        }
        const hasExactAnchorB = new Set<string>()
        for (const candidate of poolB) {
            const anchor = studentAnchors.get(candidate.studentId)
            if (isAnchorExact(anchor, candidate.slot.startTime)) hasExactAnchorB.add(candidate.studentId)
        }

        let bestPair: { a: ScheduleSuggestion; b: ScheduleSuggestion; score: number } | null = null
        for (const candidateA of poolA) {
            for (const candidateB of poolB) {
                if (candidateA.studentId === candidateB.studentId) continue
                const scoreA = scoreCandidate(candidateA, hasExactAnchorA.has(candidateA.studentId))
                const scoreB = scoreCandidate(candidateB, hasExactAnchorB.has(candidateB.studentId))
                const remainingNeedA = getRemainingNeed(candidateA.studentId)
                const remainingNeedB = getRemainingNeed(candidateB.studentId)
                const pairScore = scoreA + scoreB + 900 + remainingNeedA * 220 + remainingNeedB * 220
                if (!bestPair || pairScore > bestPair.score) {
                    bestPair = {
                        a: candidateA,
                        b: candidateB,
                        score: pairScore,
                    }
                }
            }
        }

        if (!bestPair) continue
        acceptCandidate(bestPair.a)
        if (canAssignHard(bestPair.b)) {
            acceptCandidate(bestPair.b)
        }
    }

    // Pass 2: normal fill with weekly cap.
    let madeProgress = true
    while (madeProgress) {
        madeProgress = false
        const studentOrder = getStudentPriorityOrder()
        for (const studentId of studentOrder) {
            const student = studentById.get(studentId)
            if (!student) continue
            const targetMonthlyCount = getTargetRegularCount(studentId)
            const currentMonthlyCount = studentMonthCounts.get(studentId) || 0
            if (currentMonthlyCount >= targetMonthlyCount) continue

            const pool = (candidatePoolByStudent.get(studentId) || [])
                .filter((candidate) => !finalRecommendations.has(candidate.id))
                .filter((candidate) => canAssignHard(candidate))

            if (pool.length === 0) continue

            // Hard phase first: restrict to least-filled weeks for even weekly spread.
            let minWeekCount = Number.POSITIVE_INFINITY
            for (const candidate of pool) {
                const weekIndex = getWeekNumberInMonth(year, month, candidate.slot.startTime)
                const weekCount = studentWeeklyCounts.get(studentId)?.get(weekIndex) || 0
                minWeekCount = Math.min(minWeekCount, weekCount)
            }
            const evenlyDistributedPool = pool.filter((candidate) => {
                const weekIndex = getWeekNumberInMonth(year, month, candidate.slot.startTime)
                const weekCount = studentWeeklyCounts.get(studentId)?.get(weekIndex) || 0
                return weekCount === minWeekCount
            })

            const anchor = studentAnchors.get(studentId)
            const hasExactAnchorInPool = !!anchor && evenlyDistributedPool.some((candidate) =>
                isAnchorExact(anchor, candidate.slot.startTime)
            )

            let bestCandidate: ScheduleSuggestion | null = null
            let bestScore = Number.NEGATIVE_INFINITY
            for (const candidate of evenlyDistributedPool) {
                const score = scoreCandidate(candidate, hasExactAnchorInPool)
                if (
                    !bestCandidate ||
                    score > bestScore ||
                    (score === bestScore && candidate.slot.startTime.getTime() < bestCandidate.slot.startTime.getTime())
                ) {
                    bestCandidate = candidate
                    bestScore = score
                }
            }
            if (!bestCandidate) continue

            acceptCandidate(bestCandidate)
            madeProgress = true
        }
    }

    // Pass 3: shortage recovery (weekly cap relaxed, daily cap kept).
    let madeRecoveryProgress = true
    while (madeRecoveryProgress) {
        madeRecoveryProgress = false
        const studentOrder = getStudentPriorityOrder()
        for (const studentId of studentOrder) {
            const student = studentById.get(studentId)
            if (!student) continue

            const targetMonthlyCount = getTargetRegularCount(studentId)
            if ((studentMonthCounts.get(studentId) || 0) >= targetMonthlyCount) continue

            const pool = (candidatePoolByStudent.get(studentId) || [])
                .filter((candidate) => !finalRecommendations.has(candidate.id))
                .filter((candidate) => canAssignHard(candidate, { ignoreWeeklyCap: true }))
            if (pool.length === 0) continue

            const anchor = studentAnchors.get(studentId)
            const hasExactAnchorInPool = !!anchor && pool.some((candidate) =>
                isAnchorExact(anchor, candidate.slot.startTime)
            )

            let bestCandidate: ScheduleSuggestion | null = null
            let bestScore = Number.NEGATIVE_INFINITY
            for (const candidate of pool) {
                const score = scoreCandidate(candidate, hasExactAnchorInPool)
                if (
                    !bestCandidate ||
                    score > bestScore ||
                    (score === bestScore && candidate.slot.startTime.getTime() < bestCandidate.slot.startTime.getTime())
                ) {
                    bestCandidate = candidate
                    bestScore = score
                }
            }
            if (!bestCandidate) continue

            acceptCandidate(bestCandidate)
            madeRecoveryProgress = true
        }
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

    const diagnostics: ScheduleSuggestionDiagnostic[] = students.map((student) => {
        const studentId = student.id
        const targetRegularCount = getTargetRegularCount(studentId)
        const currentRegularCount = studentMonthCounts.get(studentId) || 0
        const candidateDaySet = candidateDaySetByStudent.get(studentId) || new Set<string>()
        const assignedDaySet = studentDailyAssignments.get(studentId) || new Set<string>()
        let additionalPossibleDays = 0
        for (const dateKey of candidateDaySet) {
            if (!assignedDaySet.has(dateKey)) additionalPossibleDays += 1
        }
        const maxPossibleRegularCount = currentRegularCount + additionalPossibleDays
        const shortage = Math.max(0, targetRegularCount - maxPossibleRegularCount)
        const candidateDayCount = candidateDaySet.size

        let reasonCode: ScheduleSuggestionDiagnosticReasonCode = "TARGET_MET"
        let reasonText = "目標回数を満たしています。"
        if (shortage > 0) {
            if (candidateDayCount === 0) {
                reasonCode = "NO_CANDIDATE"
                reasonText = `希望条件に合う候補枠がないため最大${maxPossibleRegularCount}回（目標${targetRegularCount}回）`
            } else if (candidateDayCount < targetRegularCount || additionalPossibleDays === 0) {
                reasonCode = "DAILY_CAP_LIMIT"
                reasonText = `希望日${candidateDayCount}日・1日1コマ制約のため最大${maxPossibleRegularCount}回（目標${targetRegularCount}回）`
            } else {
                reasonCode = "SCHEDULE_CONFLICT"
                reasonText = `候補枠の競合により最大${maxPossibleRegularCount}回（目標${targetRegularCount}回）`
            }
        }

        return {
            studentId,
            targetRegularCount,
            currentRegularCount,
            maxPossibleRegularCount,
            shortage,
            reasonCode,
            reasonText,
        }
    })

    return {
        success: true,
        suggestions: suggestionsWithStatus,
        diagnostics,
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
                    teacherId: session.user.id!,
                    type: normalizeLessonType(s.type),
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
