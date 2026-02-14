"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { addDays, format, getDay } from "date-fns"
import { getSupportShiftsInRangeSafe } from "@/lib/support-shifts"
import { getClosedDaysInRangeSafe, isSlotClosed } from "@/lib/closed-days"
import {
    getTeacherWorkingHourRangesForDay,
    getTeacherWorkingHoursSafe,
    isWithinTeacherWorkingHours,
    type TeacherWorkingHoursByDay,
} from "@/lib/teacher-working-hours"

// --- Types ---
type LessonTypeValue = "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL" | null | undefined
type SuggestionLessonType = Exclude<LessonTypeValue, null | undefined>

export type ScheduleSuggestion = {
    id: string
    slot: {
        startTime: Date
        endTime: Date
        dayOfWeek: string
        roomId: string
    }
    studentId: string
    type: SuggestionLessonType
    matchReason: string
    conflict: boolean
    isRecommended: boolean
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
    type?: LessonTypeValue
}

// --- Configuration ---
const SLOT_DURATION_MINUTES = 30
const SLOT_DURATION_MS = SLOT_DURATION_MINUTES * 60 * 1000
const MAX_LESSONS_PER_DAY = 1

/**
 * スコアリングの重み設定
 * マジックナンバーを調整可能な定数として管理
 */
const SCORING = {
    // 基本報酬：レッスンが割り当てられること自体の価値（何よりも優先）
    BASE_ASSIGNMENT_REWARD: 2000, 
    URGENCY_BONUS_MULTIPLIER: 100, // 必要回数 x この値

    // アンカー（前月実績や希望時間）との一致ボーナス
    ANCHOR_EXACT_MATCH: 300,
    ANCHOR_NEARBY_MATCH: 150, // 近い時間
    ANCHOR_SOURCE_PREVIOUS: 50, // 前月実績がある場合の上乗せ

    // 週ごとの分散
    WEEKLY_SKEW_PENALTY: 200, // 特定の週に偏ることへのペナルティ

    // 教室・講師都合
    ROOM_A_PRIORITY: 100, // 基本的にRoom Aを埋めたい
    ROOM_B_PENALTY: 50,   // Room Bはサポートが必要等のコストがあるため少し下げる

    // 連続性（先生の空き時間を作らない）
    CONTIGUITY_BONUS: 200,      // 前後にレッスンがある
    DOUBLE_CONTIGUITY_BONUS: 100, // 両隣が埋まっている（穴埋め）

    // 並列稼働（サポート講師がいるなら、先生がいる時間に寄せる）
    PARALLEL_WORK_BONUS: 300,   // メイン講師と同時刻にRoom B稼働
    
    // ペナルティ（負の値として計算時に減算）
    GAP_PENALTY: 100,           // 30分の空き時間ができてしまう（重要度低減）
    FRAGMENTATION_PENALTY: 150, // 飛び地シフトになる
    FALLBACK_PENALTY: 150,      // フォールバック（希望度低）枠
}

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

// --- Helpers ---

function generateTeacherSlots(
    year: number,
    month: number,
    workingHoursByDay: TeacherWorkingHoursByDay
) {
    const slots: GeneratedSlot[] = []
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0)

    let current = start
    while (current <= end) {
        const day = getDay(current)
        const dayRanges = getTeacherWorkingHourRangesForDay(workingHoursByDay, day)
        for (const range of dayRanges) {
            const [startHourRaw, startMinuteRaw] = range.startTime.split(":")
            const [endHourRaw, endMinuteRaw] = range.endTime.split(":")
            const startHour = Number(startHourRaw)
            const startMinute = Number(startMinuteRaw)
            const endHour = Number(endHourRaw)
            const endMinute = Number(endMinuteRaw)
            if (
                !Number.isFinite(startHour) || !Number.isFinite(startMinute) ||
                !Number.isFinite(endHour) || !Number.isFinite(endMinute)
            ) continue

            const rangeStartMin = startHour * 60 + startMinute
            const rangeEndMin = endHour * 60 + endMinute
            for (
                let slotStartMin = rangeStartMin;
                slotStartMin + SLOT_DURATION_MINUTES <= rangeEndMin;
                slotStartMin += SLOT_DURATION_MINUTES
            ) {
                const slotHour = Math.floor(slotStartMin / 60)
                const slotMinute = slotStartMin % 60
                const slotStart = new Date(
                    current.getFullYear(),
                    current.getMonth(),
                    current.getDate(),
                    slotHour,
                    slotMinute,
                    0,
                    0
                )
                const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS)
                slots.push({
                    startTime: slotStart,
                    endTime: slotEnd,
                    dayOfWeek: format(current, "EEEE").toLowerCase(),
                    roomId: "A",
                })
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
    return hour * 60 + minute
}

function dayNameToIndex(value: string | null | undefined) {
    if (!value) return null
    const normalized = value.toLowerCase()
    const mapping: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    }
    return mapping[normalized] ?? null
}

function getWeeklyCap(defaultLessonCount: number, weekCountInMonth: number) {
    // 少ない回数の生徒が、週数の少ない週（月初・月末）に割り当てられて不利にならないよう
    // 単純な割り算ではなく、最低でも「月回数 / 週数」の切り上げを確保
    if (defaultLessonCount <= 0) return 0
    // 週数が少ない月（2月など）や、曜日配置によっては4週しかない場合もあるため、最大5週とみなして計算
    return Math.ceil(defaultLessonCount / Math.max(1, weekCountInMonth - 1)) 
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

// --- Main Logic ---

export async function generateSuggestedSchedule(
    year: number,
    month: number,
    options?: { lockedAssignments?: LockedAssignment[]; overrideStudentIds?: string[] }
) {
    // 認証チェック
    const isDebugAuthBypassed =
        process.env.NODE_ENV === "test" &&
        process.env.SCHEDULE_MAKER_DEBUG_BYPASS_AUTH === "1"
    
    let session = null;
    if (!isDebugAuthBypassed) {
        session = await auth()
        if (!session?.user || session.user.role !== "TEACHER") {
            return { success: false, error: "Unauthorized" }
        }
    }

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59)
    const previousStart = new Date(year, month - 2, 1)
    const previousEnd = new Date(year, month - 1, 0, 23, 59, 59)
    const overriddenStudentIds = new Set(options?.overrideStudentIds || [])

    // 1. Fetch Data
    const [students, existingLessons, previousMonthLessons, supportShifts, closedDays, workingHours] = await Promise.all([
        prisma.user.findMany({
            where: { role: "STUDENT" },
            select: {
                id: true,
                name: true,
                email: true,
                defaultLessonCount: true,
                monthlyAvailabilities: {
                    where: { year, month },
                    orderBy: { createdAt: "desc" },
                    take: 1
                },
                availabilities: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                },
            },
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
            select: { studentId: true, startTime: true }
        }),
        getSupportShiftsInRangeSafe(start, end),
        getClosedDaysInRangeSafe(start, end),
        getTeacherWorkingHoursSafe(),
    ])

    const typedSupportShifts = supportShifts as Array<{ startTime: Date; endTime: Date }>

    // Existing & Locked setup
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
            locked.startTime <= end &&
            !existingExactKey.has(`${locked.studentId}__${locked.startTime.getTime()}__${locked.roomId}`)
        )

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

    const existingIntervalsByRoom = new Map<string, Interval[]>()
    for (const lesson of existingLessons) {
        addInterval(existingIntervalsByRoom, lesson.roomId || "A", lesson.startTime.getTime(), lesson.endTime.getTime())
    }
    const lockedIntervalsByRoom = new Map<string, Interval[]>()
    for (const locked of lockedAssignments) {
        addInterval(lockedIntervalsByRoom, locked.roomId, locked.startTime.getTime(), locked.endTime.getTime())
    }

    const isSlotTaken = (slotStart: Date, slotEnd: Date, roomId: string) => {
        const startMs = slotStart.getTime()
        const endMs = slotEnd.getTime()
        return (
            hasIntervalOverlap(existingIntervalsByRoom.get(roomId), startMs, endMs) ||
            hasIntervalOverlap(lockedIntervalsByRoom.get(roomId), startMs, endMs)
        )
    }

    // 2. Generate Slots
    const teacherSlotsA = generateTeacherSlots(year, month, workingHours).filter(
        (slot) => !isSlotClosed(closedDays, slot.startTime, slot.endTime)
    )
    const teacherSlotsB = teacherSlotsA.filter((slot) =>
        typedSupportShifts.some((shift) => shift.startTime < slot.endTime && shift.endTime > slot.startTime)
    ).map((slot) => ({ ...slot, roomId: "B" }))
    const teacherSlots = [...teacherSlotsA, ...teacherSlotsB]
    // const supportSlotStartSet = new Set(teacherSlotsB.map((slot) => slot.startTime.getTime())) // 未使用のため削除可

    // 3. Availability Parsing (修正: Json型のキャストを追加)
    const availabilityProfileByStudent = new Map<string, any>()
    for (const student of students) {
        const monthly = student.monthlyAvailabilities[0]
        const general = student.availabilities[0]
        
        // PrismaのJson型を安全に扱うために明示的にキャスト
        const monthlyAvailable = monthly?.availableSlots as unknown as any[] || []
        const monthlyUnavailable = monthly?.unavailableSlots as unknown as any[] || []
        const generalDays = general?.days as unknown as string[] || []

        const parseSlotSet = (slots: any[]) => {
            const set = new Set<number>()
            if (!Array.isArray(slots)) return set
            for (const raw of slots) {
                const ts = new Date(String(raw)).getTime()
                if (!Number.isNaN(ts)) set.add(ts)
            }
            return set
        }
        
        availabilityProfileByStudent.set(student.id, {
            hasMonthlySpecificSlots: monthlyAvailable.length > 0,
            monthlyAvailableSlotMs: parseSlotSet(monthlyAvailable),
            monthlyUnavailableSlotMs: parseSlotSet(monthlyUnavailable),
            preferredDays: new Set(generalDays.map((d) => d.toLowerCase())),
            startTime: general?.startTime ?? null,
            endTime: general?.endTime ?? null,
        })
    }

    const checkAvailability = (studentId: string, slotDay: string, slotStart: Date, slotEnd: Date) => {
        const profile = availabilityProfileByStudent.get(studentId)
        if (!profile) return { strictMatch: false, fallbackMatch: false }

        const slotStartMs = slotStart.getTime()
        const monthlyMatch = profile.monthlyAvailableSlotMs.has(slotStartMs)
        const monthlyBlocked = profile.monthlyUnavailableSlotMs.has(slotStartMs)
        
        let generalMatch = false
        if (profile.preferredDays.has(slotDay)) {
            if (profile.startTime && profile.endTime) {
                const timeStr = format(slotStart, "HH:mm")
                const endStr = format(slotEnd, "HH:mm")
                if (timeStr >= profile.startTime && endStr <= profile.endTime) generalMatch = true
            } else {
                generalMatch = true
            }
        }

        const strictMatch = profile.hasMonthlySpecificSlots ? monthlyMatch : generalMatch
        const fallbackMatch = !strictMatch && profile.hasMonthlySpecificSlots && !monthlyBlocked && generalMatch
        return { strictMatch, fallbackMatch }
    }

    // 4. Counts & Anchors
    const studentMonthCounts = new Map<string, number>()
    const studentWeeklyCounts = new Map<string, Map<number, number>>()
    const studentDailyAssignments = new Map<string, Set<string>>()
    
    // Initial counts from existing + locked
    const countLesson = (studentId: string, date: Date, type: LessonTypeValue) => {
        const dateKey = getDateKey(date)
        if (!studentDailyAssignments.has(studentId)) studentDailyAssignments.set(studentId, new Set())
        studentDailyAssignments.get(studentId)?.add(dateKey)

        if (isContractCountType(type)) {
            studentMonthCounts.set(studentId, (studentMonthCounts.get(studentId) || 0) + 1)
            const week = getWeekNumberInMonth(year, month, date)
            if (!studentWeeklyCounts.has(studentId)) studentWeeklyCounts.set(studentId, new Map())
            const weekCounts = studentWeeklyCounts.get(studentId)!
            weekCounts.set(week, (weekCounts.get(week) || 0) + 1)
        }
    }
    
    // 修正: 配列結合を変数に受けてからforEachする（ASI対策）
    const allFixedLessons = [...existingLessons, ...lockedAssignments]
    allFixedLessons.forEach(l => countLesson(l.studentId, l.startTime, l.type))

    // Analyze Anchors
    const studentAnchors = new Map<string, StudentAnchor>()
    for (const student of students) {
        // Previous month analysis
        const prevLessons = previousMonthLessons.filter(l => l.studentId === student.id)
        if (prevLessons.length > 0) {
            const patterns = prevLessons.map(l => `${getDay(l.startTime)}__${toMinuteOfDay(l.startTime)}`)
            // Simple mode
            const counts: Record<string, number> = {}
            patterns.forEach(p => counts[p] = (counts[p] || 0) + 1)
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
            if (top) {
                const [d, m] = top[0].split("__").map(Number)
                studentAnchors.set(student.id, { dayOfWeek: d, minuteOfDay: m, source: "previous-month" })
                continue
            }
        }
        // General pref fallback
        const general = student.availabilities[0]
        // 修正: 型キャストを追加
        const generalDays = general?.days as unknown as string[] || []
        if (generalDays.length > 0 && general?.startTime) {
            const dayIdx = dayNameToIndex(generalDays[0])
            const min = parseHHMMToMinuteOfDay(general.startTime)
            if (dayIdx !== null && min !== null) {
                studentAnchors.set(student.id, { dayOfWeek: dayIdx, minuteOfDay: min, source: "default-preference" })
            }
        }
    }

    // 5. Generate Candidates & Scarcity Analysis
    const allSuggestions: ScheduleSuggestion[] = []
    const slotContentionMap = new Map<string, number>()

    for (const student of students) {
        const targetCount = student.defaultLessonCount || 4
        if ((studentMonthCounts.get(student.id) || 0) >= targetCount) continue

        for (const slot of teacherSlots) {
            if (isSlotTaken(slot.startTime, slot.endTime, slot.roomId)) continue
            
            const match = checkAvailability(student.id, slot.dayOfWeek, slot.startTime, slot.endTime)
            if (!match.strictMatch && !match.fallbackMatch) continue

            const suggestion: ScheduleSuggestion = {
                id: `${student.id}-${slot.roomId}-${slot.startTime.getTime()}`,
                slot,
                studentId: student.id,
                type: "REGULAR",
                matchReason: match.strictMatch ? "Matched" : "Matched (Fallback)",
                conflict: false,
                isRecommended: false
            }
            allSuggestions.push(suggestion)

            // Contention counting
            const slotKey = `${slot.startTime.getTime()}_${slot.roomId}`
            slotContentionMap.set(slotKey, (slotContentionMap.get(slotKey) || 0) + 1)
        }
    }

    // Calculate Weighted Scarcity
    const studentOpportunityScore = new Map<string, number>()
    const candidatePoolByStudent = new Map<string, ScheduleSuggestion[]>()
    const candidateDaySetByStudent = new Map<string, Set<string>>()

    for (const s of allSuggestions) {
        if (!candidatePoolByStudent.has(s.studentId)) candidatePoolByStudent.set(s.studentId, [])
        candidatePoolByStudent.get(s.studentId)?.push(s)

        if (!candidateDaySetByStudent.has(s.studentId)) candidateDaySetByStudent.set(s.studentId, new Set())
        candidateDaySetByStudent.get(s.studentId)?.add(getDateKey(s.slot.startTime))

        const slotKey = `${s.slot.startTime.getTime()}_${s.slot.roomId}`
        const contention = slotContentionMap.get(slotKey) || 1
        const currentScore = studentOpportunityScore.get(s.studentId) || 0
        studentOpportunityScore.set(s.studentId, currentScore + (1 / contention))
    }

    // 6. Optimizer State
    const finalRecommendations = new Set<string>()
    const roomIntervals = new Map<string, Interval[]>()
    const globalIntervals: Interval[] = []
    
    // Init state with existing/locked
    // 修正: 配列結合を変数に受けてからforEachする
    const allKnownLessons = [...existingLessons, ...lockedAssignments]
    allKnownLessons.forEach(l => {
        addInterval(roomIntervals, l.roomId || "A", l.startTime.getTime(), l.endTime.getTime())
        addGlobalInterval(globalIntervals, l.startTime.getTime(), l.endTime.getTime())
    })

    const studentById = new Map(students.map(s => [s.id, s]))
    const getTarget = (id: string) => studentById.get(id)?.defaultLessonCount || 4
    const getCurrent = (id: string) => studentMonthCounts.get(id) || 0
    const getNeed = (id: string) => Math.max(0, getTarget(id) - getCurrent(id))

    // Priority Sort Function
    const getStudentPriorityOrder = () => {
        return students.map(s => s.id).sort((a, b) => {
            const needA = getNeed(a)
            const needB = getNeed(b)
            if (needA !== needB) return needB - needA

            const scoreA = studentOpportunityScore.get(a) ?? 999
            const scoreB = studentOpportunityScore.get(b) ?? 999
            return scoreA - scoreB
        })
    }

    // Scoring Function
    const scoreCandidate = (candidate: ScheduleSuggestion, hasExactAnchorInPool: boolean) => {
        let score = 0
        const studentId = candidate.studentId
        const need = getNeed(studentId)
        const weekIndex = getWeekNumberInMonth(year, month, candidate.slot.startTime)
        const weekCount = studentWeeklyCounts.get(studentId)?.get(weekIndex) || 0
        const anchor = studentAnchors.get(studentId)
        
        // 1. Base Reward
        score += SCORING.BASE_ASSIGNMENT_REWARD
        score += need * SCORING.URGENCY_BONUS_MULTIPLIER

        // 2. Anchor/Preference
        if (anchor && getDay(candidate.slot.startTime) === anchor.dayOfWeek) {
            const diff = Math.abs(toMinuteOfDay(candidate.slot.startTime) - anchor.minuteOfDay)
            if (diff === 0) score += SCORING.ANCHOR_EXACT_MATCH
            else if (diff <= 60 && !hasExactAnchorInPool) score += SCORING.ANCHOR_NEARBY_MATCH
        }
        if (anchor?.source === "previous-month") score += SCORING.ANCHOR_SOURCE_PREVIOUS

        // 3. Weekly Distribution (Soft Cap)
        score -= weekCount * SCORING.WEEKLY_SKEW_PENALTY

        // 4. Room/Teacher Optimization
        const startMs = candidate.slot.startTime.getTime()
        const endMs = candidate.slot.endTime.getTime()
        
        if (candidate.slot.roomId === "A") score += SCORING.ROOM_A_PRIORITY
        else score -= SCORING.ROOM_B_PENALTY

        // Contiguity (Teacher gaps)
        const intervals = roomIntervals.get(candidate.slot.roomId)
        const contiguity = getContiguity(intervals, startMs, endMs)
        const adj = (contiguity.before ? 1 : 0) + (contiguity.after ? 1 : 0)
        score += adj * SCORING.CONTIGUITY_BONUS
        if (adj === 2) score += SCORING.DOUBLE_CONTIGUITY_BONUS

        // Parallel Work (Global gaps)
        const globalContiguity = getContiguity(globalIntervals, startMs, endMs)
        const globalAdj = (globalContiguity.before ? 1 : 0) + (globalContiguity.after ? 1 : 0)
        score += globalAdj * SCORING.PARALLEL_WORK_BONUS 

        const isOverlap = hasIntervalOverlap(globalIntervals, startMs, endMs)
        if (isOverlap) {
            score += SCORING.PARALLEL_WORK_BONUS
        }

        // 5. Penalties
        const frag = getFragmentationPenalty(intervals, startMs, endMs, SLOT_DURATION_MS)
        score -= frag * SCORING.FRAGMENTATION_PENALTY
        
        const globalFrag = getFragmentationPenalty(globalIntervals, startMs, endMs, SLOT_DURATION_MS)
        score -= globalFrag * SCORING.GAP_PENALTY

        // Fallback penalty
        if (candidate.matchReason.includes("Fallback")) score -= SCORING.FALLBACK_PENALTY

        // Time breaker
        score -= startMs / 10_000_000_000

        return score
    }

    const canAssign = (c: ScheduleSuggestion, ignoreWeekCap = false) => {
        if (getNeed(c.studentId) <= 0) return false
        
        // Daily Cap
        const dailySet = studentDailyAssignments.get(c.studentId)
        if (dailySet?.has(getDateKey(c.slot.startTime)) && MAX_LESSONS_PER_DAY <= 1) return false

        // Slot Conflict Check (Dynamic)
        if (hasIntervalOverlap(roomIntervals.get(c.slot.roomId), c.slot.startTime.getTime(), c.slot.endTime.getTime())) return false

        // Weekly Cap (unless ignored in Pass 3)
        if (!ignoreWeekCap) {
            const weekIndex = getWeekNumberInMonth(year, month, c.slot.startTime)
            const currentWeek = studentWeeklyCounts.get(c.studentId)?.get(weekIndex) || 0
            const cap = getWeeklyCap(getTarget(c.studentId), 5)
            if (currentWeek >= cap) return false
        }

        return true
    }

    const commitAssignment = (c: ScheduleSuggestion) => {
        finalRecommendations.add(c.id)
        addInterval(roomIntervals, c.slot.roomId, c.slot.startTime.getTime(), c.slot.endTime.getTime())
        addGlobalInterval(globalIntervals, c.slot.startTime.getTime(), c.slot.endTime.getTime())
        countLesson(c.studentId, c.slot.startTime, c.type)
    }

    // Execution Loops
    const runPass = (ignoreWeekCap: boolean) => {
        let changed = true
        while (changed) {
            changed = false
            const order = getStudentPriorityOrder()
            for (const studentId of order) {
                if (getNeed(studentId) <= 0) continue

                const pool = (candidatePoolByStudent.get(studentId) || [])
                    .filter(c => !finalRecommendations.has(c.id))
                    .filter(c => canAssign(c, ignoreWeekCap))
                
                if (pool.length === 0) continue

                // Check anchor existence for scoring context
                const anchor = studentAnchors.get(studentId)
                const hasExact = anchor ? pool.some(c => getDay(c.slot.startTime) === anchor.dayOfWeek && toMinuteOfDay(c.slot.startTime) === anchor.minuteOfDay) : false

                let best: ScheduleSuggestion | null = null
                let bestScore = Number.NEGATIVE_INFINITY

                for (const c of pool) {
                    const score = scoreCandidate(c, hasExact)
                    if (score > bestScore) {
                        bestScore = score
                        best = c
                    }
                }

                if (best) {
                    commitAssignment(best)
                    changed = true
                }
            }
        }
    }

    // Execute Passes
    runPass(false) // Normal
    runPass(true)  // Recovery

    // 7. Results Construction
    const suggestionsWithStatus = [...lockedSuggestions, ...allSuggestions].map(s => {
        const isRecommended = lockedSuggestions.some(l => l.id === s.id) || finalRecommendations.has(s.id)
        let conflict = false
        if (!isRecommended) {
             const recsInRoom = [...finalRecommendations].map(id => 
                 [...lockedSuggestions, ...allSuggestions].find(x => x.id === id)
             ).filter(x => x && x.slot.roomId === s.slot.roomId) as ScheduleSuggestion[]
             
             conflict = recsInRoom.some(r => 
                 r.slot.startTime.getTime() < s.slot.endTime.getTime() && 
                 r.slot.endTime.getTime() > s.slot.startTime.getTime()
             )
        }

        return {
            ...s,
            isRecommended,
            conflict
        }
    })

    // Diagnostics
    const diagnostics: ScheduleSuggestionDiagnostic[] = students.map((student) => {
        const studentId = student.id
        const targetRegularCount = getTarget(studentId)
        const currentRegularCount = getCurrent(studentId)
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
                reasonText = `候補枠なし（最大${maxPossibleRegularCount}回/目標${targetRegularCount}回）`
            } else if (additionalPossibleDays === 0) {
                reasonCode = "DAILY_CAP_LIMIT"
                reasonText = `1日1コマ制約（最大${maxPossibleRegularCount}回/目標${targetRegularCount}回）`
            } else {
                reasonCode = "SCHEDULE_CONFLICT"
                reasonText = `競合により枠確保不可（最大${maxPossibleRegularCount}回/目標${targetRegularCount}回）`
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