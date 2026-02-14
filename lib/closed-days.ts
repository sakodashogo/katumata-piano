import { prisma } from "@/lib/prisma"
import { unstable_cache } from "next/cache"

type DelegateMethod = (args: unknown) => Promise<unknown>

export type ClosedDayScope = "teacher" | "student"
export type ClosedDayQueryOptions = {
    scope?: ClosedDayScope
}

export const CLOSED_DAYS_CACHE_TAG = "closed-days"
const CLOSED_DAYS_CACHE_REVALIDATE_SECONDS = 60
const TOKYO_TIME_ZONE = "Asia/Tokyo"
const TOKYO_UTC_OFFSET_HOURS = 9
const TOKYO_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
})
const TOKYO_WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
}

export type ClosedDayRecord = {
    id: string
    date: Date
    startTime: string | null
    endTime: string | null
    reason: string | null
}

type TokyoDateTimeParts = {
    dateKey: string
    dayOfWeek: number
    minuteOfDay: number
}

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

function parseTokyoDateKey(dateKey: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return { year, month, day }
}

function formatDateKey(year: number, month: number, day: number) {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function addDaysUtc(base: Date, days: number) {
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
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

function getTokyoDateTimeParts(value: Date): TokyoDateTimeParts | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null

    let year: string | null = null
    let month: string | null = null
    let day: string | null = null
    let weekday: string | null = null
    let hour: string | null = null
    let minute: string | null = null

    for (const part of TOKYO_DATE_PARTS_FORMATTER.formatToParts(value)) {
        if (part.type === "year") year = part.value
        if (part.type === "month") month = part.value
        if (part.type === "day") day = part.value
        if (part.type === "weekday") weekday = part.value
        if (part.type === "hour") hour = part.value
        if (part.type === "minute") minute = part.value
    }

    if (!year || !month || !day || !weekday || !hour || !minute) return null

    const dayOfWeek = TOKYO_WEEKDAY_INDEX[weekday]
    const hourNum = Number(hour)
    const minuteNum = Number(minute)

    if (!Number.isInteger(dayOfWeek)) return null
    if (!Number.isInteger(hourNum) || !Number.isInteger(minuteNum)) return null
    if (hourNum < 0 || hourNum > 23 || minuteNum < 0 || minuteNum > 59) return null

    return {
        dateKey: `${year}-${month}-${day}`,
        dayOfWeek,
        minuteOfDay: hourNum * 60 + minuteNum,
    }
}

export function toTokyoDateKey(value: Date) {
    const parts = getTokyoDateTimeParts(value)
    return parts ? parts.dateKey : null
}

export function toTokyoWeekdayIndex(value: Date) {
    const parts = getTokyoDateTimeParts(value)
    return parts ? parts.dayOfWeek : null
}

export function tokyoDateKeyToDate(dateKey: string) {
    const parsed = parseTokyoDateKey(dateKey)
    if (!parsed) return null
    return new Date(
        Date.UTC(
            parsed.year,
            parsed.month - 1,
            parsed.day,
            -TOKYO_UTC_OFFSET_HOURS,
            0,
            0,
            0
        )
    )
}

export function getTokyoMonthDateRange(year: number, month: number) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
    const start = tokyoDateKeyToDate(formatDateKey(year, month, 1))
    if (!start) return null
    const nextYear = month === 12 ? year + 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    const endExclusive = tokyoDateKeyToDate(formatDateKey(nextYear, nextMonth, 1))
    if (!endExclusive) return null
    return { start, endExclusive }
}

export function getDaysInTokyoMonth(year: number, month: number) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function getClosedDayQueryRange(start: Date, end: Date) {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) return null

    const effectiveEnd = end > start ? new Date(end.getTime() - 1) : new Date(start)
    const startDateKey = toTokyoDateKey(start)
    const endDateKey = toTokyoDateKey(effectiveEnd)
    if (!startDateKey || !endDateKey) return null

    const rangeStart = tokyoDateKeyToDate(startDateKey)
    const rangeEndDate = tokyoDateKeyToDate(endDateKey)
    if (!rangeStart || !rangeEndDate) return null

    return {
        start: rangeStart,
        endExclusive: addDaysUtc(rangeEndDate, 1),
    }
}

function getClosedDayDelegates() {
    const delegate = prisma as unknown as {
        closedDay?: { findMany: DelegateMethod }
        publishedClosedDay?: { findMany: DelegateMethod }
    }
    return {
        draft: delegate.closedDay,
        published: delegate.publishedClosedDay,
    }
}

export async function getClosedDaysInRangeSafe(
    start: Date,
    end: Date,
    options?: ClosedDayQueryOptions
): Promise<ClosedDayRecord[]> {
    const scope = options?.scope ?? "teacher"
    const range = getClosedDayQueryRange(start, end)
    if (!range) return []
    const records = await getClosedDaysInRangeCached(
        range.start.toISOString(),
        range.endExclusive.toISOString(),
        scope
    )
    return records.map((record) => ({
        ...record,
        date: new Date(record.date),
    }))
}

async function fetchClosedDaysInRangeUncached(start: Date, end: Date, scope: ClosedDayScope): Promise<ClosedDayRecord[]> {
    const { draft, published } = getClosedDayDelegates()
    const delegate = scope === "student" ? published : draft
    if (!delegate || typeof delegate.findMany !== "function") {
        return []
    }

    try {
        const records = await delegate.findMany({
            where: {
                date: { gte: start, lt: end },
            },
            orderBy: { date: "asc" },
        })
        return (records as ClosedDayRecord[]).map((record) => ({
            ...record,
            date: new Date(record.date),
        }))
    } catch (error) {
        if (isMissingRelationError(error)) return []
        throw error
    }
}

const getClosedDaysInRangeCached = unstable_cache(
    async (startIso: string, endIso: string, scope: ClosedDayScope) => {
        const records = await fetchClosedDaysInRangeUncached(new Date(startIso), new Date(endIso), scope)
        return records.map((record) => ({
            ...record,
            date: record.date.toISOString(),
        }))
    },
    ["closed-days-range:v1"],
    { revalidate: CLOSED_DAYS_CACHE_REVALIDATE_SECONDS, tags: [CLOSED_DAYS_CACHE_TAG] }
)

/**
 * Check if a 30-min slot falls within a closed period.
 * slotStart/slotEnd are Date objects representing the slot's time range.
 */
export function isSlotClosed(closedDays: ClosedDayRecord[], slotStart: Date, slotEnd: Date): boolean {
    const start = getTokyoDateTimeParts(slotStart)
    const end = getTokyoDateTimeParts(slotEnd)
    if (!start || !end) return false
    if (start.dateKey !== end.dateKey) return false

    for (const closed of closedDays) {
        const closedDateKey = toTokyoDateKey(new Date(closed.date))

        if (!closedDateKey || closedDateKey !== start.dateKey) continue

        // Whole-day closure
        if (!closed.startTime || !closed.endTime) {
            return true
        }

        // Partial closure: check time overlap
        const closedStartMin = parseHHMMToMinute(closed.startTime)
        const closedEndMin = parseHHMMToMinute(closed.endTime)
        if (closedStartMin === null || closedEndMin === null) continue

        // Overlap check
        if (start.minuteOfDay < closedEndMin && end.minuteOfDay > closedStartMin) {
            return true
        }
    }

    return false
}
