"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { getClosedDaysInRangeSafe, isSlotClosed } from "@/lib/closed-days"
import { SUPPORT_SHIFTS_CACHE_TAG } from "@/lib/support-shifts"
import { getTeacherWorkingHoursSafe, isWithinTeacherWorkingHours } from "@/lib/teacher-working-hours"
import {
    SUPPORT_SHIFT_RANGE_CACHE_TAG,
    SUPPORT_STAFF_CACHE_TAG,
} from "@/lib/cache-tags"

const SUPPORT_DATA_REVALIDATE_SECONDS = 60
const TOKYO_UTC_OFFSET_HOURS = 9
const TOKYO_TIME_ZONE = "Asia/Tokyo"
const TOKYO_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO_TIME_ZONE,
    weekday: "short",
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

type DelegateMethod = (args: unknown) => Promise<unknown>

function toTokyoDate(
    year: number,
    month: number,
    dayOfMonth: number,
    hour: number,
    minute: number
) {
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(dayOfMonth) ||
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        month < 1 ||
        month > 12 ||
        dayOfMonth < 1 ||
        dayOfMonth > 31 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null
    }

    const date = new Date(
        Date.UTC(
            year,
            month - 1,
            dayOfMonth,
            hour - TOKYO_UTC_OFFSET_HOURS,
            minute,
            0,
            0
        )
    )
    if (Number.isNaN(date.getTime())) return null
    return date
}

function getTokyoWeekday(date: Date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
    const weekday = TOKYO_WEEKDAY_FORMATTER.format(date)
    const dayOfWeek = TOKYO_WEEKDAY_INDEX[weekday]
    return Number.isInteger(dayOfWeek) ? dayOfWeek : null
}

function getTokyoMonthRange(year: number, month: number) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null
    }
    const monthStart = toTokyoDate(year, month, 1, 0, 0)
    if (!monthStart) return null
    const nextMonthYear = month === 12 ? year + 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    const monthEndExclusive = toTokyoDate(nextMonthYear, nextMonth, 1, 0, 0)
    if (!monthEndExclusive) return null
    return { monthStart, monthEndExclusive }
}

function getDaysInMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

function getSupportStaffDelegate() {
    return (prisma as unknown as {
        supportStaff?: {
            findMany: DelegateMethod
            findFirst: DelegateMethod
            create: DelegateMethod
            update: DelegateMethod
            delete: DelegateMethod
        }
    }).supportStaff
}

function getSupportShiftDelegate() {
    return (prisma as unknown as {
        supportShift?: {
            findMany: DelegateMethod
            findFirst: DelegateMethod
            update: DelegateMethod
            create: DelegateMethod
            delete: DelegateMethod
            deleteMany: DelegateMethod
        }
    }).supportShift
}

function revalidateSupportViews() {
    revalidatePath("/teacher/support")
    revalidatePath("/teacher/resources")
    revalidatePath("/teacher/schedule")
    revalidatePath("/teacher/schedule/monthly")
    revalidatePath("/student/book")
    revalidateTag(SUPPORT_SHIFTS_CACHE_TAG, "max")
    revalidateTag(SUPPORT_STAFF_CACHE_TAG, "max")
    revalidateTag(SUPPORT_SHIFT_RANGE_CACHE_TAG, "max")
}

async function requireTeacher() {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return null
    }
    return session
}

const getSupportStaffCached = unstable_cache(
    async () => {
        const supportStaff = getSupportStaffDelegate()
        if (!supportStaff || typeof supportStaff.findMany !== "function") {
            return [] as Array<{ id: string; name: string; active: boolean }>
        }
        try {
            const staff = await supportStaff.findMany({
                orderBy: [{ active: "desc" }, { name: "asc" }],
            }) as Array<{ id: string; name: string; active: boolean }>
            return staff
        } catch (error) {
            if (isMissingRelationError(error)) return []
            throw error
        }
    },
    ["support-staff:v1"],
    { revalidate: SUPPORT_DATA_REVALIDATE_SECONDS, tags: [SUPPORT_STAFF_CACHE_TAG] }
)

const getSupportShiftsInRangeCached = unstable_cache(
    async (startIso: string, endIso: string) => {
        const startTime = new Date(startIso)
        const endTime = new Date(endIso)
        const supportShift = getSupportShiftDelegate()
        if (!supportShift || typeof supportShift.findMany !== "function") {
            return [] as Array<{
                id: string
                staffId: string
                startTime: Date
                endTime: Date
                staff?: { id: string; name: string; active: boolean } | null
            }>
        }
        try {
            const shifts = await supportShift.findMany({
                where: {
                    startTime: { lt: endTime },
                    endTime: { gt: startTime },
                },
                include: {
                    staff: {
                        select: {
                            id: true,
                            name: true,
                            active: true,
                        },
                    },
                },
                orderBy: { startTime: "asc" },
            }) as Array<{
                id: string
                staffId: string
                startTime: Date
                endTime: Date
                staff?: { id: string; name: string; active: boolean } | null
            }>
            return shifts
        } catch (error) {
            if (isMissingRelationError(error)) return []
            throw error
        }
    },
    ["support-shifts-range:v1"],
    { revalidate: SUPPORT_DATA_REVALIDATE_SECONDS, tags: [SUPPORT_SHIFT_RANGE_CACHE_TAG] }
)

export async function getSupportStaff() {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const staff = await getSupportStaffCached()
        return { success: true as const, data: staff }
    } catch (error) {
        if (isMissingRelationError(error)) return { success: true as const, data: [] }
        return { success: false as const, error: "サポート講師の取得に失敗しました。" }
    }
}

export async function createSupportStaff(name: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    const trimmed = name.trim()
    if (!trimmed) return { success: false as const, error: "講師名を入力してください。" }

    try {
        const supportStaff = getSupportStaffDelegate()
        if (!supportStaff || typeof supportStaff.create !== "function") {
            return { success: false as const, error: "DB未更新のため講師登録できません。" }
        }
        const existing = await supportStaff.findFirst({
            where: { name: trimmed },
            select: { id: true },
        }) as { id: string } | null
        if (existing) {
            return { success: false as const, error: "同名のサポート講師が既にいます。" }
        }
        const created = await supportStaff.create({
            data: { name: trimmed, active: true },
        }) as { id: string; name: string; active: boolean }
        revalidateSupportViews()
        return { success: true as const, data: created }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため講師登録できません。" }
        }
        return { success: false as const, error: "講師登録に失敗しました。" }
    }
}

export async function setSupportStaffActive(id: string, active: boolean) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const supportStaff = getSupportStaffDelegate()
        if (!supportStaff || typeof supportStaff.update !== "function") {
            return { success: false as const, error: "DB未更新のため更新できません。" }
        }
        await supportStaff.update({
            where: { id },
            data: { active },
        })
        revalidateSupportViews()
        return { success: true as const }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため更新できません。" }
        }
        return { success: false as const, error: "講師状態の更新に失敗しました。" }
    }
}

// 新規追加: サポート講師の削除
export async function deleteSupportStaff(id: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const supportStaff = getSupportStaffDelegate()
        if (!supportStaff || typeof supportStaff.delete !== "function") {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        
        // Cascade削除が設定されている前提、もしくは関連レコードがない場合削除可能
        await supportStaff.delete({ where: { id } })
        
        revalidateSupportViews()
        return { success: true as const }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        return { success: false as const, error: "講師の削除に失敗しました。" }
    }
}

export async function getSupportShiftsInRange(startIso: string, endIso: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const shifts = await getSupportShiftsInRangeCached(startIso, endIso)
        return { success: true as const, data: shifts }
    } catch (error) {
        if (isMissingRelationError(error)) return { success: true as const, data: [] }
        return { success: false as const, error: "シフト取得に失敗しました。" }
    }
}

export async function upsertSupportShift(input: {
    id?: string
    staffId: string
    startTime: string
    endTime: string
}) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const startTime = new Date(input.startTime)
        const endTime = new Date(input.endTime)
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || startTime >= endTime) {
            return { success: false as const, error: "開始/終了時刻が不正です。" }
        }
        const workingHours = await getTeacherWorkingHoursSafe()
        if (!isWithinTeacherWorkingHours(workingHours, startTime, endTime)) {
            return { success: false as const, error: "曜日ごとのレッスン許可時間外にはシフトを設定できません。" }
        }

        const closedDays = await getClosedDaysInRangeSafe(startTime, endTime, { scope: "teacher" })
        if (isSlotClosed(closedDays, startTime, endTime)) {
            return { success: false as const, error: "お休み時間帯にはシフトを設定できません。" }
        }

        const supportShift = getSupportShiftDelegate()
        if (!supportShift) {
            return { success: false as const, error: "DB未更新のためシフト保存できません。マイグレーション適用後に再実行してください。" }
        }

        const overlap = await supportShift.findFirst({
            where: {
                id: input.id ? { not: input.id } : undefined,
                staffId: input.staffId,
                startTime: { lt: endTime },
                endTime: { gt: startTime },
            },
            select: { id: true },
        })
        if (overlap) {
            return { success: false as const, error: "同じ講師のシフトが重複しています。" }
        }

        const data = input.id
            ? await supportShift.update({
                where: { id: input.id },
                data: { staffId: input.staffId, startTime, endTime },
            })
            : await supportShift.create({
                data: { staffId: input.staffId, startTime, endTime },
            })

        revalidateSupportViews()
        return { success: true as const, data }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のためシフト保存できません。マイグレーション適用後に再実行してください。" }
        }
        return { success: false as const, error: "シフト保存に失敗しました。" }
    }
}

export async function createMonthlySupportShifts(input: {
    staffId: string
    year: number
    month: number
    weekdays: number[]
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number
}) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const weekdaySet = new Set(
            input.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        )
        if (weekdaySet.size === 0) {
            return { success: false as const, error: "曜日を1つ以上選択してください。" }
        }
        const monthRange = getTokyoMonthRange(input.year, input.month)
        if (!monthRange) {
            return { success: false as const, error: "年月が不正です。" }
        }
        const { monthStart, monthEndExclusive } = monthRange
        const [closedDays, workingHours] = await Promise.all([
            getClosedDaysInRangeSafe(monthStart, monthEndExclusive, { scope: "teacher" }),
            getTeacherWorkingHoursSafe(),
        ])

        const supportShift = getSupportShiftDelegate()
        if (!supportShift || typeof supportShift.findMany !== "function" || typeof supportShift.create !== "function") {
            return { success: false as const, error: "DB未更新のため月間登録できません。" }
        }

        let created = 0
        let skipped = 0
        let skippedClosed = 0
        let skippedOutsideWorkingHours = 0
        const daysInMonth = getDaysInMonth(input.year, input.month)
        for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth++) {
            const startTime = toTokyoDate(input.year, input.month, dayOfMonth, input.startHour, input.startMinute)
            const endTime = toTokyoDate(input.year, input.month, dayOfMonth, input.endHour, input.endMinute)
            if (!startTime || !endTime) {
                skipped++
                continue
            }
            const dayOfWeek = getTokyoWeekday(startTime)
            if (dayOfWeek === null || !weekdaySet.has(dayOfWeek)) {
                continue
            }
            if (endTime <= startTime) {
                skipped++
                continue
            }
            if (!isWithinTeacherWorkingHours(workingHours, startTime, endTime)) {
                skippedOutsideWorkingHours++
                continue
            }
            if (isSlotClosed(closedDays, startTime, endTime)) {
                skippedClosed++
                continue
            }
            const overlap = await supportShift.findFirst({
                where: {
                    staffId: input.staffId,
                    startTime: { lt: endTime },
                    endTime: { gt: startTime },
                },
                select: { id: true },
            }) as { id: string } | null
            if (overlap) {
                skipped++
                continue
            }
            await supportShift.create({
                data: { staffId: input.staffId, startTime, endTime },
            })
            created++
        }

        revalidateSupportViews()
        return { success: true as const, created, skipped, skippedClosed, skippedOutsideWorkingHours }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため月間登録できません。" }
        }
        return { success: false as const, error: "月間シフト登録に失敗しました。" }
    }
}

export async function deleteSupportShift(id: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const supportShift = getSupportShiftDelegate()
        if (!supportShift || typeof supportShift.delete !== "function") {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        await supportShift.delete({ where: { id } })
        revalidateSupportViews()
        return { success: true as const }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        return { success: false as const, error: "削除に失敗しました。" }
    }
}

type ReplaceSupportShiftsInput = {
    staffId: string
    rangeStartIso: string
    rangeEndIso: string
    slotStartIsos: string[]
}

type ShiftInterval = { startTime: Date; endTime: Date }

function mergeIntervals(intervals: ShiftInterval[]) {
    if (intervals.length === 0) return []
    const sorted = [...intervals].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    const merged: ShiftInterval[] = []
    for (const interval of sorted) {
        if (interval.endTime <= interval.startTime) continue
        const last = merged[merged.length - 1]
        if (!last) {
            merged.push(interval)
            continue
        }
        if (interval.startTime <= last.endTime) {
            if (interval.endTime > last.endTime) {
                last.endTime = interval.endTime
            }
        } else {
            merged.push(interval)
        }
    }
    return merged
}

export async function replaceSupportShiftsForStaffInRange(input: ReplaceSupportShiftsInput) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const rangeStart = new Date(input.rangeStartIso)
        const rangeEnd = new Date(input.rangeEndIso)
        if (
            Number.isNaN(rangeStart.getTime()) ||
            Number.isNaN(rangeEnd.getTime()) ||
            rangeEnd <= rangeStart
        ) {
            return { success: false as const, error: "対象期間が不正です。" }
        }

        const supportShift = getSupportShiftDelegate()
        if (
            !supportShift ||
            typeof supportShift.findMany !== "function" ||
            typeof supportShift.create !== "function" ||
            typeof supportShift.deleteMany !== "function"
        ) {
            return { success: false as const, error: "DB未更新のためシフト保存できません。マイグレーション適用後に再実行してください。" }
        }

        const existing = await supportShift.findMany({
            where: {
                staffId: input.staffId,
                startTime: { lt: rangeEnd },
                endTime: { gt: rangeStart },
            },
            orderBy: { startTime: "asc" },
            select: { id: true, startTime: true, endTime: true },
        }) as Array<{ id: string; startTime: Date; endTime: Date }>

        const keepIntervals: ShiftInterval[] = []
        for (const shift of existing) {
            if (shift.startTime < rangeStart) {
                keepIntervals.push({
                    startTime: shift.startTime,
                    endTime: shift.endTime < rangeStart ? shift.endTime : rangeStart,
                })
            }
            if (shift.endTime > rangeEnd) {
                keepIntervals.push({
                    startTime: shift.startTime > rangeEnd ? shift.startTime : rangeEnd,
                    endTime: shift.endTime,
                })
            }
        }

        const normalizedSlotStarts = Array.from(
            new Set(
                input.slotStartIsos
                    .map((value) => new Date(value))
                    .filter((date) => !Number.isNaN(date.getTime()))
                    .filter((date) => date >= rangeStart && date < rangeEnd)
                    .map((date) => date.toISOString())
            )
        )
            .map((value) => new Date(value))
            .sort((a, b) => a.getTime() - b.getTime())

        const [closedDays, workingHours] = await Promise.all([
            getClosedDaysInRangeSafe(rangeStart, rangeEnd, { scope: "teacher" }),
            getTeacherWorkingHoursSafe(),
        ])
        let skippedClosedCount = 0
        let skippedOutsideWorkingHoursCount = 0
        const openSlotStarts = normalizedSlotStarts.filter((startTime) => {
            const endTime = new Date(startTime.getTime() + 30 * 60 * 1000)
            const isClosed = isSlotClosed(closedDays, startTime, endTime)
            if (isClosed) skippedClosedCount++
            if (isClosed) return false
            const outsideWorking = !isWithinTeacherWorkingHours(workingHours, startTime, endTime)
            if (outsideWorking) skippedOutsideWorkingHoursCount++
            return !outsideWorking
        })

        const generatedIntervals = mergeIntervals(
            openSlotStarts.map((startTime) => ({
                startTime,
                endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
            }))
        )

        const finalIntervals = mergeIntervals([...keepIntervals, ...generatedIntervals])

        if (existing.length > 0) {
            const overlapIds = existing.map((shift) => shift.id)
            await supportShift.deleteMany({
                where: { id: { in: overlapIds } },
            })
        }

        for (const interval of finalIntervals) {
            await supportShift.create({
                data: {
                    staffId: input.staffId,
                    startTime: interval.startTime,
                    endTime: interval.endTime,
                },
            })
        }

        revalidateSupportViews()
        return { success: true as const, count: finalIntervals.length, skippedClosedCount, skippedOutsideWorkingHoursCount }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のためシフト保存できません。マイグレーション適用後に再実行してください。" }
        }
        return { success: false as const, error: "週次シフト保存に失敗しました。" }
    }
}