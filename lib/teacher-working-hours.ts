import { prisma } from "@/lib/prisma"

type DelegateMethod = (args?: unknown) => Promise<unknown>
type Delegate = {
    findMany?: DelegateMethod
    upsert?: DelegateMethod
}

type MinuteRange = {
    startMin: number
    endMin: number
}

export type TeacherWorkingHourRange = {
    startTime: string
    endTime: string
}

export type TeacherWorkingHoursByDay = Record<number, TeacherWorkingHourRange[]>

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const

const DEFAULT_TEMPLATE: TeacherWorkingHoursByDay = {
    0: [],
    1: [{ startTime: "14:00", endTime: "20:00" }],
    2: [{ startTime: "14:00", endTime: "20:00" }],
    3: [{ startTime: "14:00", endTime: "20:00" }],
    4: [{ startTime: "14:00", endTime: "20:00" }],
    5: [{ startTime: "14:00", endTime: "20:00" }],
    6: [{ startTime: "14:00", endTime: "20:00" }],
}

const SELECT_WORKING_HOUR_ROWS_SQL = `
SELECT "dayOfWeek", "timeRanges"
FROM "TeacherWorkingHour"
ORDER BY "dayOfWeek" ASC
`

const UPSERT_WORKING_HOUR_ROW_SQL = `
INSERT INTO "TeacherWorkingHour" ("id", "dayOfWeek", "timeRanges", "createdAt", "updatedAt")
VALUES ($1, $2, CAST($3 AS jsonb), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("dayOfWeek")
DO UPDATE SET
  "timeRanges" = EXCLUDED."timeRanges",
  "updatedAt" = CURRENT_TIMESTAMP
`

const CREATE_WORKING_HOUR_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "TeacherWorkingHour" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeRanges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherWorkingHour_pkey" PRIMARY KEY ("id")
)
`

const CREATE_WORKING_HOUR_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherWorkingHour_dayOfWeek_key"
ON "TeacherWorkingHour"("dayOfWeek")
`

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as {
        code?: string
        message?: string
        meta?: { code?: string; message?: string }
    }
    if (e.code === "P2021") return true
    if (e.code === "P2010" && e.meta?.code === "42P01") return true

    const message = [
        typeof e.message === "string" ? e.message : "",
        typeof e.meta?.message === "string" ? e.meta.message : "",
    ].join(" ").toLowerCase()

    return message.includes("teacherworkinghour") && message.includes("does not exist")
}

function parseHHMMToMinute(value: string | null | undefined): number | null {
    if (!value || typeof value !== "string") return null
    const [hourRaw, minuteRaw] = value.split(":")
    const hour = Number(hourRaw)
    const minute = Number(minuteRaw)
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return hour * 60 + minute
}

function minuteToHHMM(value: number) {
    const hour = Math.floor(value / 60)
    const minute = value % 60
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function cloneWorkingHours(template: TeacherWorkingHoursByDay): TeacherWorkingHoursByDay {
    const next: TeacherWorkingHoursByDay = {
        0: [],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
    }
    for (const day of WEEKDAY_INDEXES) {
        next[day] = (template[day] || []).map((range) => ({
            startTime: range.startTime,
            endTime: range.endTime,
        }))
    }
    return next
}

export function getDefaultTeacherWorkingHours(): TeacherWorkingHoursByDay {
    return cloneWorkingHours(DEFAULT_TEMPLATE)
}

function normalizeMinuteRanges(ranges: MinuteRange[]) {
    if (ranges.length === 0) return []
    const sorted = [...ranges].sort((left, right) => left.startMin - right.startMin)
    const merged: MinuteRange[] = []
    for (const current of sorted) {
        const last = merged[merged.length - 1]
        if (!last) {
            merged.push({ ...current })
            continue
        }
        if (current.startMin <= last.endMin) {
            if (current.endMin > last.endMin) {
                last.endMin = current.endMin
            }
            continue
        }
        merged.push({ ...current })
    }
    return merged
}

export function normalizeTeacherWorkingHourRanges(ranges: unknown): TeacherWorkingHourRange[] {
    if (!Array.isArray(ranges)) return []

    const minuteRanges: MinuteRange[] = []
    for (const item of ranges) {
        if (!item || typeof item !== "object") continue
        const row = item as { startTime?: string; endTime?: string }
        const startMin = parseHHMMToMinute(row.startTime)
        const endMin = parseHHMMToMinute(row.endTime)
        if (startMin === null || endMin === null) continue
        if (endMin <= startMin) continue
        minuteRanges.push({ startMin, endMin })
    }

    return normalizeMinuteRanges(minuteRanges).map((range) => ({
        startTime: minuteToHHMM(range.startMin),
        endTime: minuteToHHMM(range.endMin),
    }))
}

export function normalizeTeacherWorkingHoursByDay(
    input: Partial<Record<number, TeacherWorkingHourRange[]>> | null | undefined
): TeacherWorkingHoursByDay {
    const next = getDefaultTeacherWorkingHours()
    if (!input) return next

    for (const day of WEEKDAY_INDEXES) {
        if (!Object.prototype.hasOwnProperty.call(input, day)) continue
        next[day] = normalizeTeacherWorkingHourRanges(input[day])
    }

    return next
}

function getTeacherWorkingHourDelegate() {
    return (prisma as unknown as {
        teacherWorkingHour?: Delegate
    }).teacherWorkingHour
}

type TeacherWorkingHourRow = {
    dayOfWeek: unknown
    timeRanges: unknown
}

function mapRowsToWorkingHours(rows: TeacherWorkingHourRow[]) {
    const base = getDefaultTeacherWorkingHours()
    for (const row of rows) {
        const day = Number(row.dayOfWeek)
        if (!WEEKDAY_INDEXES.includes(day as (typeof WEEKDAY_INDEXES)[number])) continue
        base[day] = normalizeTeacherWorkingHourRanges(row.timeRanges)
    }
    return base
}

async function fetchTeacherWorkingHourRowsRaw() {
    try {
        const rows = await prisma.$queryRawUnsafe<TeacherWorkingHourRow[]>(SELECT_WORKING_HOUR_ROWS_SQL)
        return rows
    } catch (error) {
        if (isMissingRelationError(error)) return null
        throw error
    }
}

function buildWorkingHourRowId(dayOfWeek: number) {
    const token = Math.random().toString(36).slice(2, 10)
    return `teacher-working-hour-${dayOfWeek}-${Date.now()}-${token}`
}

async function upsertTeacherWorkingHoursRaw(workingHours: TeacherWorkingHoursByDay) {
    await prisma.$transaction(
        WEEKDAY_INDEXES.map((dayOfWeek) =>
            prisma.$executeRawUnsafe(
                UPSERT_WORKING_HOUR_ROW_SQL,
                buildWorkingHourRowId(dayOfWeek),
                dayOfWeek,
                JSON.stringify(workingHours[dayOfWeek] || [])
            )
        )
    )
}

async function ensureTeacherWorkingHourTableRaw() {
    await prisma.$executeRawUnsafe(CREATE_WORKING_HOUR_TABLE_SQL)
    await prisma.$executeRawUnsafe(CREATE_WORKING_HOUR_INDEX_SQL)
}

export async function getTeacherWorkingHoursSafe(): Promise<TeacherWorkingHoursByDay> {
    const delegate = getTeacherWorkingHourDelegate()
    if (delegate && typeof delegate.findMany === "function") {
        try {
            const rows = await delegate.findMany({
                select: {
                    dayOfWeek: true,
                    timeRanges: true,
                },
                orderBy: {
                    dayOfWeek: "asc",
                },
            }) as TeacherWorkingHourRow[]

            return mapRowsToWorkingHours(rows)
        } catch (error) {
            if (!isMissingRelationError(error)) throw error
        }
    }

    const rows = await fetchTeacherWorkingHourRowsRaw()
    if (!rows) return getDefaultTeacherWorkingHours()
    return mapRowsToWorkingHours(rows)
}

export async function saveTeacherWorkingHoursSafe(
    workingHours: Partial<Record<number, TeacherWorkingHourRange[]>> | null | undefined
) {
    const normalized = normalizeTeacherWorkingHoursByDay(workingHours)
    const delegate = getTeacherWorkingHourDelegate()

    if (delegate && typeof delegate.upsert === "function") {
        try {
            for (const dayOfWeek of WEEKDAY_INDEXES) {
                await delegate.upsert({
                    where: { dayOfWeek },
                    update: {
                        timeRanges: normalized[dayOfWeek],
                    },
                    create: {
                        dayOfWeek,
                        timeRanges: normalized[dayOfWeek],
                    },
                })
            }
            return normalized
        } catch (error) {
            if (!isMissingRelationError(error)) throw error
        }
    }

    try {
        await upsertTeacherWorkingHoursRaw(normalized)
        return normalized
    } catch (error) {
        if (!isMissingRelationError(error)) throw error
    }

    await ensureTeacherWorkingHourTableRaw()
    await upsertTeacherWorkingHoursRaw(normalized)
    return normalized
}

export function isWithinTeacherWorkingHours(
    workingHours: TeacherWorkingHoursByDay,
    startTime: Date,
    endTime: Date
) {
    if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) return false
    if (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) return false
    if (endTime <= startTime) return false

    if (
        startTime.getFullYear() !== endTime.getFullYear() ||
        startTime.getMonth() !== endTime.getMonth() ||
        startTime.getDate() !== endTime.getDate()
    ) {
        return false
    }

    const dayOfWeek = startTime.getDay()
    const ranges = workingHours[dayOfWeek] || []
    if (ranges.length === 0) return false

    const slotStartMin = startTime.getHours() * 60 + startTime.getMinutes()
    const slotEndMin = endTime.getHours() * 60 + endTime.getMinutes()

    return ranges.some((range) => {
        const rangeStartMin = parseHHMMToMinute(range.startTime)
        const rangeEndMin = parseHHMMToMinute(range.endTime)
        if (rangeStartMin === null || rangeEndMin === null) return false
        return slotStartMin >= rangeStartMin && slotEndMin <= rangeEndMin
    })
}

export function filterSlotIsoListByTeacherWorkingHours(
    workingHours: TeacherWorkingHoursByDay,
    slotIsos: string[],
    durationMin = 30
) {
    const unique = new Set<string>()
    const result: string[] = []
    for (const value of slotIsos) {
        const slotStart = new Date(value)
        if (Number.isNaN(slotStart.getTime())) continue
        const slotEnd = new Date(slotStart.getTime() + Math.max(durationMin, 1) * 60 * 1000)
        if (!isWithinTeacherWorkingHours(workingHours, slotStart, slotEnd)) continue
        const iso = slotStart.toISOString()
        if (unique.has(iso)) continue
        unique.add(iso)
        result.push(iso)
    }
    return result
}

export function getTeacherWorkingHourRangesForDay(
    workingHours: TeacherWorkingHoursByDay,
    dayOfWeek: number
) {
    if (!WEEKDAY_INDEXES.includes(dayOfWeek as (typeof WEEKDAY_INDEXES)[number])) return []
    return normalizeTeacherWorkingHourRanges(workingHours[dayOfWeek])
}
