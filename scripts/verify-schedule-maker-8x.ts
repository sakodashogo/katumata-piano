import { generateSuggestedSchedule, type LockedAssignment } from "@/app/lib/actions/schedule-maker"
import { prisma } from "@/lib/prisma"

type LessonType = "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"

type StudentFixture = {
    id: string
    name: string
    email: string
    defaultLessonCount: number
    monthlyAvailabilities: Array<{
        availableSlots: string[]
        unavailableSlots: string[]
    }>
    availabilities: Array<{
        days: string[]
        startTime: string
        endTime: string
    }>
}

type LessonFixture = {
    studentId: string
    startTime: Date
    endTime: Date
    roomId: "A" | "B"
    type: LessonType
    status: "BOOKED"
}

type PreviousLessonFixture = {
    studentId: string
    startTime: Date
}

type ShiftFixture = {
    startTime: Date
    endTime: Date
}

type ClosedDayFixture = {
    id: string
    date: Date
    startTime: string | null
    endTime: string | null
    reason: string | null
}

type ScenarioFixture = {
    year: number
    month: number
    students: StudentFixture[]
    existingLessons: LessonFixture[]
    previousMonthLessons: PreviousLessonFixture[]
    supportShifts: ShiftFixture[]
    closedDays: ClosedDayFixture[]
    lockedAssignments: LockedAssignment[]
    primaryEightStudentId: string
}

type SuggestionResult = Awaited<ReturnType<typeof generateSuggestedSchedule>>

function createRng(seed: number) {
    let state = seed >>> 0
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0
        return state / 0x1_0000_0000
    }
}

function pick<T>(values: T[], random: () => number) {
    return values[Math.floor(random() * values.length)]!
}

function shuffle<T>(values: T[], random: () => number) {
    const next = [...values]
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1))
        const tmp = next[i]
        next[i] = next[j]
        next[j] = tmp
    }
    return next
}

function toIso(year: number, month: number, day: number, hour: number, minute: number) {
    return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

function parseHourMinute(value: string) {
    const [h, m] = value.split(":").map(Number)
    return { hour: h, minute: m }
}

function dayIndexToName(day: number) {
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day]!
}

function monthDays(year: number, month: number) {
    return new Date(year, month, 0).getDate()
}

function eachMonthDate(year: number, month: number) {
    const days = monthDays(year, month)
    const list: Date[] = []
    for (let day = 1; day <= days; day += 1) {
        list.push(new Date(year, month - 1, day, 0, 0, 0, 0))
    }
    return list
}

function buildMonthlyAvailableSlots(
    year: number,
    month: number,
    preferredDays: string[],
    startTime: string,
    endTime: string,
    random: () => number,
    density: number
) {
    const result: string[] = []
    const preferredSet = new Set(preferredDays)
    const start = parseHourMinute(startTime)
    const end = parseHourMinute(endTime)
    const startMinutes = start.hour * 60 + start.minute
    const endMinutes = end.hour * 60 + end.minute
    for (const dayDate of eachMonthDate(year, month)) {
        const dayName = dayIndexToName(dayDate.getDay())
        if (!preferredSet.has(dayName)) continue
        for (let minute = startMinutes; minute + 30 <= endMinutes; minute += 30) {
            if (random() > density) continue
            const hour = Math.floor(minute / 60)
            const m = minute % 60
            result.push(toIso(year, month, dayDate.getDate(), hour, m))
        }
    }
    return result
}

function pickSlotForStudent(
    year: number,
    month: number,
    student: StudentFixture,
    random: () => number,
    blockedStartMs: Set<number>
) {
    const days = student.availabilities[0]?.days ?? []
    const preferredSet = new Set(days)
    const start = parseHourMinute(student.availabilities[0]?.startTime ?? "14:00")
    const end = parseHourMinute(student.availabilities[0]?.endTime ?? "20:00")
    const startMinutes = start.hour * 60 + start.minute
    const endMinutes = end.hour * 60 + end.minute
    const candidates: Array<{ startTime: Date; endTime: Date; roomId: "A" | "B" }> = []
    for (const dayDate of eachMonthDate(year, month)) {
        if (!preferredSet.has(dayIndexToName(dayDate.getDay()))) continue
        for (let minute = startMinutes; minute + 30 <= endMinutes; minute += 30) {
            const hour = Math.floor(minute / 60)
            const m = minute % 60
            const startTime = new Date(year, month - 1, dayDate.getDate(), hour, m, 0, 0)
            const startMs = startTime.getTime()
            if (blockedStartMs.has(startMs)) continue
            const endTime = new Date(startTime.getTime() + 30 * 60 * 1000)
            candidates.push({ startTime, endTime, roomId: random() < 0.2 ? "B" : "A" })
        }
    }
    if (candidates.length === 0) return null
    return pick(candidates, random)
}

function createSingleEightScenario(seed: number): ScenarioFixture {
    const random = createRng(seed)
    const year = 2026
    const month = 1 + Math.floor(random() * 12)

    const dayPool = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const preferredDays = shuffle(dayPool, random).slice(0, 2 + Math.floor(random() * 3))
    const startHour = 14 + Math.floor(random() * 3)
    const endHour = Math.min(20, startHour + 3 + Math.floor(random() * 2))

    const monthlyDensity = 0.4 + random() * 0.4
    const monthlyAvailable = buildMonthlyAvailableSlots(
        year,
        month,
        preferredDays,
        `${String(startHour).padStart(2, "0")}:00`,
        `${String(endHour).padStart(2, "0")}:00`,
        random,
        monthlyDensity
    )
    const monthlyUnavailable = monthlyAvailable.filter(() => random() < 0.08)

    const student: StudentFixture = {
        id: "s8-primary",
        name: "Eight Primary",
        email: "eight.primary@example.com",
        defaultLessonCount: 8,
        monthlyAvailabilities: random() < 0.75
            ? [{ availableSlots: monthlyAvailable, unavailableSlots: monthlyUnavailable }]
            : [{ availableSlots: [], unavailableSlots: [] }],
        availabilities: [{
            days: preferredDays,
            startTime: `${String(startHour).padStart(2, "0")}:00`,
            endTime: `${String(endHour).padStart(2, "0")}:00`,
        }],
    }

    const closedDays: ClosedDayFixture[] = []
    for (const date of eachMonthDate(year, month)) {
        if (random() >= 0.06) continue
        if (random() < 0.5) {
            closedDays.push({
                id: `closed-full-${date.toISOString()}`,
                date,
                startTime: null,
                endTime: null,
                reason: "full",
            })
        } else {
            const h = 14 + Math.floor(random() * 5)
            closedDays.push({
                id: `closed-partial-${date.toISOString()}`,
                date,
                startTime: `${String(h).padStart(2, "0")}:00`,
                endTime: `${String(Math.min(20, h + 2)).padStart(2, "0")}:00`,
                reason: "partial",
            })
        }
    }

    return {
        year,
        month,
        students: [student],
        existingLessons: [],
        previousMonthLessons: [],
        supportShifts: [],
        closedDays,
        lockedAssignments: [],
        primaryEightStudentId: student.id,
    }
}

function createMixedScenario(seed: number): ScenarioFixture {
    const random = createRng(seed)
    const year = 2026
    const month = 1 + Math.floor(random() * 12)
    const students: StudentFixture[] = []

    const allDayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const primaryDaySet = shuffle(allDayNames, random).slice(0, 3 + Math.floor(random() * 2))
    const primaryMonthlyAvailable = buildMonthlyAvailableSlots(
        year,
        month,
        primaryDaySet,
        "14:00",
        "20:00",
        random,
        0.42 + random() * 0.2
    )
    const primaryMonthlyUnavailable = primaryMonthlyAvailable.filter(() => random() < 0.05)

    const primary: StudentFixture = {
        id: "s8-primary",
        name: "Eight Primary",
        email: "eight.primary@example.com",
        defaultLessonCount: 8,
        monthlyAvailabilities: [{
            availableSlots: primaryMonthlyAvailable,
            unavailableSlots: primaryMonthlyUnavailable,
        }],
        availabilities: [{
            days: primaryDaySet,
            startTime: "14:00",
            endTime: "20:00",
        }],
    }
    students.push(primary)

    for (let i = 0; i < 10; i += 1) {
        const isEight = random() < 0.15
        const preferredDays = shuffle(allDayNames, random).slice(0, isEight ? 3 : 2 + Math.floor(random() * 2))
        const startHour = 14 + Math.floor(random() * 4)
        const endHour = Math.min(20, startHour + 2 + Math.floor(random() * 3))
        const useMonthly = random() < 0.55
        const monthlyAvailable = useMonthly
            ? buildMonthlyAvailableSlots(
                year,
                month,
                preferredDays,
                `${String(startHour).padStart(2, "0")}:00`,
                `${String(endHour).padStart(2, "0")}:00`,
                random,
                0.35 + random() * 0.3
            )
            : []
        const monthlyUnavailable = monthlyAvailable.filter(() => random() < 0.08)
        students.push({
            id: `s-${i}`,
            name: `Student ${i}`,
            email: `student.${i}@example.com`,
            defaultLessonCount: isEight ? 8 : 4,
            monthlyAvailabilities: [{ availableSlots: monthlyAvailable, unavailableSlots: monthlyUnavailable }],
            availabilities: [{
                days: preferredDays,
                startTime: `${String(startHour).padStart(2, "0")}:00`,
                endTime: `${String(endHour).padStart(2, "0")}:00`,
            }],
        })
    }

    const supportShifts: ShiftFixture[] = []
    for (const date of eachMonthDate(year, month)) {
        if (date.getDay() === 0) continue
        if (random() >= 0.35) continue
        const startHour = 14 + Math.floor(random() * 4)
        const duration = 2 + Math.floor(random() * 4)
        supportShifts.push({
            startTime: new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, 0, 0, 0),
            endTime: new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.min(20, startHour + duration), 0, 0, 0),
        })
    }

    const closedDays: ClosedDayFixture[] = []
    for (const date of eachMonthDate(year, month)) {
        if (random() >= 0.08) continue
        if (random() < 0.45) {
            closedDays.push({
                id: `closed-full-${date.toISOString()}`,
                date,
                startTime: null,
                endTime: null,
                reason: "full",
            })
        } else {
            const startHour = 14 + Math.floor(random() * 5)
            closedDays.push({
                id: `closed-partial-${date.toISOString()}`,
                date,
                startTime: `${String(startHour).padStart(2, "0")}:00`,
                endTime: `${String(Math.min(20, startHour + 2)).padStart(2, "0")}:00`,
                reason: "partial",
            })
        }
    }

    const blockedStartMs = new Set<number>()
    const existingLessons: LessonFixture[] = []
    for (const student of students) {
        const preload = Math.floor(random() * (student.defaultLessonCount === 8 ? 3 : 2))
        for (let i = 0; i < preload; i += 1) {
            const picked = pickSlotForStudent(year, month, student, random, blockedStartMs)
            if (!picked) break
            blockedStartMs.add(picked.startTime.getTime())
            existingLessons.push({
                studentId: student.id,
                startTime: picked.startTime,
                endTime: picked.endTime,
                roomId: picked.roomId,
                type: "REGULAR",
                status: "BOOKED",
            })
        }
    }

    const lockedAssignments: LockedAssignment[] = []
    for (let i = 0; i < 16; i += 1) {
        if (random() < 0.35) continue
        const student = pick(students, random)
        const picked = pickSlotForStudent(year, month, student, random, blockedStartMs)
        if (!picked) continue
        const key = `${student.id}:${picked.startTime.getTime()}:${picked.roomId}`
        if (lockedAssignments.some((item) =>
            `${item.studentId}:${new Date(item.startTime).getTime()}:${item.roomId}` === key
        )) {
            continue
        }
        blockedStartMs.add(picked.startTime.getTime())
        lockedAssignments.push({
            studentId: student.id,
            roomId: picked.roomId,
            startTime: picked.startTime,
            endTime: picked.endTime,
            type: "REGULAR",
        })
    }

    const previousMonthLessons: PreviousLessonFixture[] = []
    for (const student of students) {
        if (random() < 0.35) continue
        const prevMonth = month === 1 ? 12 : month - 1
        const prevYear = month === 1 ? year - 1 : year
        const count = 2 + Math.floor(random() * 3)
        for (let i = 0; i < count; i += 1) {
            const day = 1 + Math.floor(random() * monthDays(prevYear, prevMonth))
            const hour = 14 + Math.floor(random() * 6)
            const minute = random() < 0.5 ? 0 : 30
            previousMonthLessons.push({
                studentId: student.id,
                startTime: new Date(prevYear, prevMonth - 1, day, hour, minute, 0, 0),
            })
        }
    }

    return {
        year,
        month,
        students,
        existingLessons,
        previousMonthLessons,
        supportShifts,
        closedDays,
        lockedAssignments,
        primaryEightStudentId: primary.id,
    }
}

function installPrismaMocks(fixture: ScenarioFixture) {
    const userDelegate = prisma.user as unknown as { findMany: (args?: unknown) => Promise<unknown> }
    const lessonDelegate = prisma.lesson as unknown as { findMany: (args?: unknown) => Promise<unknown> }
    const prismaAny = prisma as unknown as Record<string, unknown>

    const originalUserFindMany = userDelegate.findMany
    const originalLessonFindMany = lessonDelegate.findMany
    const originalSupportShift = prismaAny.supportShift
    const originalClosedDay = prismaAny.closedDay

    userDelegate.findMany = async () => fixture.students

    lessonDelegate.findMany = async (argsRaw?: unknown) => {
        const args = (argsRaw || {}) as {
            select?: { studentId?: boolean; startTime?: boolean }
            where?: {
                startTime?: { gte?: Date; lte?: Date }
                studentId?: { notIn?: string[] }
            }
            orderBy?: Array<{ studentId?: "asc" | "desc"; startTime?: "asc" | "desc" }>
        }
        const isPreviousQuery = !!args.select?.studentId && !!args.select?.startTime
        const gte = args.where?.startTime?.gte
        const lte = args.where?.startTime?.lte
        const notIn = args.where?.studentId?.notIn || []
        const orderBy = Array.isArray(args.orderBy) ? args.orderBy : []

        const applyFilters = <T extends { studentId: string; startTime: Date }>(source: T[]) => {
            let filtered = [...source]
            if (gte) {
                filtered = filtered.filter((row) => row.startTime >= gte)
            }
            if (lte) {
                filtered = filtered.filter((row) => row.startTime <= lte)
            }
            if (notIn.length > 0) {
                filtered = filtered.filter((row) => !notIn.includes(row.studentId))
            }
            if (orderBy.length > 0) {
                filtered.sort((left, right) => {
                    for (const order of orderBy) {
                        if (order.studentId) {
                            if (left.studentId !== right.studentId) {
                                return order.studentId === "asc"
                                    ? left.studentId.localeCompare(right.studentId)
                                    : right.studentId.localeCompare(left.studentId)
                            }
                        }
                        if (order.startTime) {
                            if (left.startTime.getTime() !== right.startTime.getTime()) {
                                return order.startTime === "asc"
                                    ? left.startTime.getTime() - right.startTime.getTime()
                                    : right.startTime.getTime() - left.startTime.getTime()
                            }
                        }
                    }
                    return 0
                })
            }
            return filtered
        }

        if (isPreviousQuery) {
            const filtered = applyFilters(fixture.previousMonthLessons)
            return filtered.map((row) => ({
                studentId: row.studentId,
                startTime: row.startTime,
            }))
        }

        const filtered = applyFilters(fixture.existingLessons)
        return filtered.map((row) => ({
            studentId: row.studentId,
            startTime: row.startTime,
            endTime: row.endTime,
            roomId: row.roomId,
            type: row.type,
            status: "BOOKED",
        }))
    }

    prismaAny.supportShift = {
        findMany: async (argsRaw?: unknown) => {
            const args = (argsRaw || {}) as {
                where?: { startTime?: { lt?: Date }; endTime?: { gt?: Date } }
            }
            const lt = args.where?.startTime?.lt
            const gt = args.where?.endTime?.gt
            return fixture.supportShifts.filter((shift) => {
                if (lt && shift.startTime >= lt) return false
                if (gt && shift.endTime <= gt) return false
                return true
            }).map((shift, index) => ({
                id: `shift-${index}`,
                startTime: shift.startTime,
                endTime: shift.endTime,
                staff: { id: "staff-1", name: "Staff", active: true },
            }))
        }
    }

    prismaAny.closedDay = {
        findMany: async (argsRaw?: unknown) => {
            const args = (argsRaw || {}) as { where?: { date?: { gte?: Date; lt?: Date } } }
            const gte = args.where?.date?.gte
            const lt = args.where?.date?.lt
            return fixture.closedDays.filter((record) => {
                if (gte && record.date < gte) return false
                if (lt && record.date >= lt) return false
                return true
            })
        }
    }

    return () => {
        userDelegate.findMany = originalUserFindMany
        lessonDelegate.findMany = originalLessonFindMany
        prismaAny.supportShift = originalSupportShift
        prismaAny.closedDay = originalClosedDay
    }
}

async function runScenario(fixture: ScenarioFixture) {
    const restore = installPrismaMocks(fixture)
    try {
        const result = await generateSuggestedSchedule(fixture.year, fixture.month, {
            lockedAssignments: fixture.lockedAssignments,
        })
        return result
    } finally {
        restore()
    }
}

function getRecommendedCount(result: SuggestionResult, studentId: string) {
    if (!result.success || !result.suggestions) return 0
    return result.suggestions.filter((item) => item.studentId === studentId && item.isRecommended && !item.conflict).length
}

async function runSingleEightStress(totalCases: number) {
    let failed = 0
    let firstFailure: null | Record<string, unknown> = null
    for (let seed = 1; seed <= totalCases; seed += 1) {
        const fixture = createSingleEightScenario(seed)
        const result = await runScenario(fixture)
        if (!result.success || !result.diagnostics) {
            failed += 1
            if (!firstFailure) {
                firstFailure = { seed, reason: result.success ? "missing-data" : result.error }
            }
            continue
        }
        const studentId = fixture.primaryEightStudentId
        const recommended = getRecommendedCount(result, studentId)
        const diag = result.diagnostics.find((item) => item.studentId === studentId)
        const expected = Math.min(8, diag?.maxPossibleRegularCount ?? 0)
        if (recommended !== expected) {
            failed += 1
            if (!firstFailure) {
                firstFailure = {
                    seed,
                    year: fixture.year,
                    month: fixture.month,
                    recommended,
                    expected,
                    diagnostic: diag,
                }
            }
        }
    }
    return { totalCases, failed, firstFailure }
}

async function runMixedStress(totalCases: number) {
    let fulfilled = 0
    let limitedByPhysical = 0
    let competitionGap = 0
    let firstCompetitionGap: null | Record<string, unknown> = null

    for (let seed = 1; seed <= totalCases; seed += 1) {
        const fixture = createMixedScenario(10_000 + seed)
        const fullResult = await runScenario(fixture)
        if (!fullResult.success || !fullResult.suggestions || !fullResult.students) {
            continue
        }

        const eightId = fixture.primaryEightStudentId
        const fullCount = getRecommendedCount(fullResult, eightId)

        const soloFixture: ScenarioFixture = {
            ...fixture,
            students: fixture.students.filter((student) => student.id === eightId),
        }
        const soloResult = await runScenario(soloFixture)
        if (!soloResult.success) continue
        const soloCount = getRecommendedCount(soloResult, eightId)

        if (fullCount >= 8) {
            fulfilled += 1
            continue
        }
        if (soloCount < 8) {
            limitedByPhysical += 1
            continue
        }

        competitionGap += 1
        if (!firstCompetitionGap) {
            const fallbackCandidateCount = fullResult.suggestions.filter((item) =>
                item.studentId === eightId && item.matchReason.includes("fallback")
            ).length
            const fourSummary = fixture.students
                .filter((student) => student.defaultLessonCount === 4)
                .map((student) => ({
                    id: student.id,
                    got: getRecommendedCount(fullResult, student.id),
                    target: 4,
                }))
            firstCompetitionGap = {
                seed: 10_000 + seed,
                year: fixture.year,
                month: fixture.month,
                fullCount,
                soloCount,
                fallbackCandidateCount,
                fourMetCount: fourSummary.filter((item) => item.got >= item.target).length,
                fourTotalCount: fourSummary.length,
            }
        }
    }

    return {
        totalCases,
        fulfilled,
        limitedByPhysical,
        competitionGap,
        firstCompetitionGap,
    }
}

function createTargetedFallbackRescueScenario(): ScenarioFixture {
    const year = 2026
    const month = 4
    const strictSlots: string[] = [
        toIso(year, month, 1, 16, 0),
        toIso(year, month, 2, 16, 0),
        toIso(year, month, 3, 16, 0),
        toIso(year, month, 4, 16, 0),
        toIso(year, month, 8, 16, 0),
        toIso(year, month, 9, 16, 0),
        toIso(year, month, 10, 16, 0),
        toIso(year, month, 11, 16, 0),
    ]

    const primary: StudentFixture = {
        id: "s8-primary",
        name: "Eight Primary",
        email: "eight.primary@example.com",
        defaultLessonCount: 8,
        monthlyAvailabilities: [{ availableSlots: strictSlots, unavailableSlots: [] }],
        availabilities: [{
            days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
            startTime: "14:00",
            endTime: "20:00",
        }],
    }

    const competitors: StudentFixture[] = []
    for (let i = 0; i < 10; i += 1) {
        competitors.push({
            id: `s4-${i}`,
            name: `Four ${i}`,
            email: `four.${i}@example.com`,
            defaultLessonCount: 4,
            monthlyAvailabilities: [{ availableSlots: strictSlots, unavailableSlots: [] }],
            availabilities: [{
                days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
                startTime: "14:00",
                endTime: "20:00",
            }],
        })
    }

    const students = [primary, ...competitors]
    return {
        year,
        month,
        students,
        existingLessons: [],
        previousMonthLessons: [],
        supportShifts: [],
        closedDays: [],
        lockedAssignments: [],
        primaryEightStudentId: primary.id,
    }
}

async function runTargetedFallbackRescueCase() {
    const fixture = createTargetedFallbackRescueScenario()

    process.env.SCHEDULE_MAKER_LEGACY_FALLBACK_GATING = "1"
    const legacy = await runScenario(fixture)
    const legacyCount = getRecommendedCount(legacy, fixture.primaryEightStudentId)

    delete process.env.SCHEDULE_MAKER_LEGACY_FALLBACK_GATING
    const improved = await runScenario(fixture)
    const improvedCount = getRecommendedCount(improved, fixture.primaryEightStudentId)

    return {
        year: fixture.year,
        month: fixture.month,
        legacyCount,
        improvedCount,
    }
}

async function main() {
    const env = process.env as Record<string, string | undefined>
    env.NODE_ENV = "test"
    env.SCHEDULE_MAKER_DEBUG_BYPASS_AUTH = "1"

    const targeted = await runTargetedFallbackRescueCase()
    const single = await runSingleEightStress(300)
    const mixed = await runMixedStress(220)

    console.log("== Targeted Fallback Rescue Case ==")
    console.log(`year=${targeted.year} month=${targeted.month} legacyCount=${targeted.legacyCount} improvedCount=${targeted.improvedCount}`)

    console.log("== Single Student (8 lessons) ==")
    console.log(`cases=${single.totalCases} failed=${single.failed}`)
    if (single.firstFailure) {
        console.log("firstFailure=", JSON.stringify(single.firstFailure, null, 2))
    }

    console.log("== Mixed Students (8 + many 4) ==")
    console.log(`cases=${mixed.totalCases} fulfilled=${mixed.fulfilled} limitedByPhysical=${mixed.limitedByPhysical} competitionGap=${mixed.competitionGap}`)
    if (mixed.firstCompetitionGap) {
        console.log("firstCompetitionGap=", JSON.stringify(mixed.firstCompetitionGap, null, 2))
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
