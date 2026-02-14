'use server'

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath, revalidateTag } from "next/cache"
import {
    addMinutes,
} from "date-fns"
import { isStudentBookableMenu } from "@/lib/menu-category"
import {
    getClosedDaysInRangeSafe,
    getDaysInTokyoMonth,
    getTokyoMonthDateRange,
    isSlotClosed,
    toTokyoWeekdayIndex,
    tokyoDateKeyToDate,
} from "@/lib/closed-days"
import { getTeacherWorkingHoursSafe, isWithinTeacherWorkingHours } from "@/lib/teacher-working-hours"
import { OPEN_SLOTS_CACHE_TAG, SCHEDULE_DATA_CACHE_TAG, SLOT_MANAGER_MONTH_CACHE_TAG } from "@/lib/cache-tags"

function revalidateSlotManagementViews() {
    revalidatePath('/teacher/slots')
    revalidateTag(SLOT_MANAGER_MONTH_CACHE_TAG, "max")
    revalidateTag(OPEN_SLOTS_CACHE_TAG, "max")
    revalidateTag(SCHEDULE_DATA_CACHE_TAG, "max")
}

type RoomTimeRange = {
    roomId: string
    startTime: Date
    endTime: Date
}

function hasTimeOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && aEnd > bStart
}

function hasRoomOverlap(ranges: RoomTimeRange[], target: RoomTimeRange) {
    return ranges.some((range) =>
        range.roomId === target.roomId &&
        hasTimeOverlap(range.startTime, range.endTime, target.startTime, target.endTime)
    )
}

export async function getMenusForSlots() {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    try {
        const menus = await prisma.menu.findMany({
            select: {
                id: true,
                name: true,
                durationMin: true,
                price: true,
                description: true,
            },
            orderBy: [{ price: "asc" }, { durationMin: "asc" }],
        })
        const filteredMenus = menus.filter((menu) =>
            isStudentBookableMenu(menu as { name?: string | null; category?: unknown })
        )
        return { success: true as const, data: filteredMenus }
    } catch {
        return { success: false as const, error: "Failed to fetch menus" }
    }
}

type BatchCreateInput = {
    year: number
    month: number
    weekdays: number[]
    timeRanges: { start: string; end: string }[]
    roomIds: string[]
    menuId?: string
    durationMin: number
}

export async function batchCreateOpenSlots(input: BatchCreateInput) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    try {
        const weekdaySet = new Set(
            input.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        )
        if (weekdaySet.size === 0) {
            return { success: false as const, error: "曜日を選択してください。" }
        }
        for (const range of input.timeRanges) {
            if (range.start >= range.end) {
                return { success: false as const, error: "時間帯の開始は終了より前に設定してください。" }
            }
        }

        const monthRange = getTokyoMonthDateRange(input.year, input.month)
        const daysInMonth = getDaysInTokyoMonth(input.year, input.month)
        if (!monthRange || !daysInMonth) {
            return { success: false as const, error: "年月が不正です。" }
        }
        const monthStart = monthRange.start
        const monthEndExclusive = monthRange.endExclusive

        const [existingSlots, existingLessons, closedDays, workingHours] = await Promise.all([
            prisma.openSlot.findMany({
                where: {
                    startTime: { gte: monthStart, lt: monthEndExclusive },
                    roomId: { in: input.roomIds },
                },
                select: { startTime: true, endTime: true, roomId: true },
            }),
            prisma.lesson.findMany({
                where: {
                    status: { not: "CANCELLED" },
                    roomId: { in: input.roomIds },
                    startTime: { lt: monthEndExclusive },
                    endTime: { gt: monthStart },
                },
                select: { startTime: true, endTime: true, roomId: true },
            }),
            getClosedDaysInRangeSafe(monthStart, monthEndExclusive, { scope: "teacher" }),
            getTeacherWorkingHoursSafe(),
        ])

        const occupiedRanges: RoomTimeRange[] = [
            ...existingSlots.map((slot) => ({
                roomId: slot.roomId,
                startTime: slot.startTime,
                endTime: slot.endTime,
            })),
            ...existingLessons
                .flatMap((lesson) => {
                    if (!lesson.roomId) return []
                    return [{
                        roomId: lesson.roomId,
                        startTime: lesson.startTime,
                        endTime: lesson.endTime,
                    }]
                }),
        ]

        const slotsToCreate: {
            roomId: string
            startTime: Date
            endTime: Date
            menuId: string | undefined
            durationMin: number
            isPublic: boolean
        }[] = []
        let skippedClosedCount = 0
        let skippedOutsideWorkingCount = 0

        for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth++) {
            const dateKey = `${String(input.year).padStart(4, "0")}-${String(input.month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`
            const dayStart = tokyoDateKeyToDate(dateKey)
            if (!dayStart) continue
            const dayOfWeek = toTokyoWeekdayIndex(dayStart)
            if (dayOfWeek === null || !weekdaySet.has(dayOfWeek)) continue

            for (const range of input.timeRanges) {
                const [startH, startM] = range.start.split(':').map(Number)
                const [endH, endM] = range.end.split(':').map(Number)
                const rangeStart = new Date(dayStart.getTime() + (startH * 60 + startM) * 60 * 1000)
                const rangeEnd = new Date(dayStart.getTime() + (endH * 60 + endM) * 60 * 1000)

                let current = rangeStart
                while (addMinutes(current, input.durationMin) <= rangeEnd) {
                    const slotEnd = addMinutes(current, input.durationMin)
                    if (!isWithinTeacherWorkingHours(workingHours, current, slotEnd)) {
                        skippedOutsideWorkingCount += input.roomIds.length
                        current = addMinutes(current, input.durationMin)
                        continue
                    }
                    if (isSlotClosed(closedDays, current, slotEnd)) {
                        skippedClosedCount += input.roomIds.length
                        current = addMinutes(current, input.durationMin)
                        continue
                    }

                    for (const roomId of input.roomIds) {
                        const candidate: RoomTimeRange = {
                            roomId,
                            startTime: current,
                            endTime: slotEnd,
                        }
                        if (hasRoomOverlap(occupiedRanges, candidate)) continue

                        slotsToCreate.push({
                            roomId,
                            startTime: current,
                            endTime: slotEnd,
                            menuId: input.menuId || undefined,
                            durationMin: input.durationMin,
                            isPublic: false,
                        })
                        occupiedRanges.push(candidate)
                    }

                    current = addMinutes(current, input.durationMin)
                }
            }
        }

        if (slotsToCreate.length === 0) {
            return { success: true as const, count: 0, skippedClosedCount, skippedOutsideWorkingCount }
        }

        await prisma.openSlot.createMany({ data: slotsToCreate })

        revalidateSlotManagementViews()
        return { success: true as const, count: slotsToCreate.length, skippedClosedCount, skippedOutsideWorkingCount }
    } catch {
        return { success: false as const, error: "Failed to batch create slots" }
    }
}

export async function getDraftSlots(year: number, month: number) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    const monthRange = getTokyoMonthDateRange(year, month)
    if (!monthRange) return { success: false as const, error: "Invalid month range" }
    const start = monthRange.start
    const endExclusive = monthRange.endExclusive

    try {
        const slots = await prisma.openSlot.findMany({
            where: {
                startTime: { gte: start, lt: endExclusive },
                isPublic: false,
                isBooked: false,
            },
            include: {
                menu: {
                    select: {
                        id: true,
                        name: true,
                        durationMin: true,
                        price: true,
                        description: true,
                    },
                },
            },
            orderBy: { startTime: 'asc' },
        })
        return { success: true as const, data: slots }
    } catch {
        return { success: false as const, error: "Failed to fetch draft slots" }
    }
}

export async function getAllSlotsByMonth(year: number, month: number) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    const monthRange = getTokyoMonthDateRange(year, month)
    if (!monthRange) return { success: false as const, error: "Invalid month range" }
    const start = monthRange.start
    const endExclusive = monthRange.endExclusive

    try {
        const slots = await prisma.openSlot.findMany({
            where: {
                startTime: { gte: start, lt: endExclusive },
            },
            include: {
                menu: {
                    select: {
                        id: true,
                        name: true,
                        durationMin: true,
                        price: true,
                        description: true,
                    },
                },
            },
            orderBy: { startTime: 'asc' },
        })
        return { success: true as const, data: slots }
    } catch {
        return { success: false as const, error: "Failed to fetch slots" }
    }
}

export async function updateSlotDetails(
    slotId: string,
    data: { durationMin?: number; menuId?: string | null }
) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    try {
        const existing = await prisma.openSlot.findUnique({ where: { id: slotId } })
        if (!existing) return { success: false as const, error: "Slot not found" }
        if (existing.isBooked) return { success: false as const, error: "Cannot edit booked slot" }

        const updateData: Record<string, unknown> = {}
        const nextEndTime =
            data.durationMin !== undefined ? addMinutes(existing.startTime, data.durationMin) : existing.endTime

        if (data.durationMin !== undefined) {
            const workingHours = await getTeacherWorkingHoursSafe()
            if (!isWithinTeacherWorkingHours(workingHours, existing.startTime, nextEndTime)) {
                return { success: false as const, error: "曜日ごとのレッスン許可時間外のため変更できません。" }
            }
            const closedDays = await getClosedDaysInRangeSafe(existing.startTime, nextEndTime, { scope: "teacher" })
            if (isSlotClosed(closedDays, existing.startTime, nextEndTime)) {
                return { success: false as const, error: "お休み時間帯のため変更できません。" }
            }
        }

        if (data.durationMin !== undefined) {
            updateData.durationMin = data.durationMin
            updateData.endTime = nextEndTime
        }

        if (data.menuId !== undefined) {
            updateData.menuId = data.menuId
        }

        if (data.durationMin !== undefined) {
            const [slotConflict, lessonConflict] = await Promise.all([
                prisma.openSlot.findFirst({
                    where: {
                        id: { not: slotId },
                        roomId: existing.roomId,
                        startTime: { lt: nextEndTime },
                        endTime: { gt: existing.startTime },
                    },
                    select: { id: true },
                }),
                prisma.lesson.findFirst({
                    where: {
                        status: { not: "CANCELLED" },
                        roomId: existing.roomId,
                        startTime: { lt: nextEndTime },
                        endTime: { gt: existing.startTime },
                    },
                    select: { id: true },
                }),
            ])

            if (slotConflict || lessonConflict) {
                return { success: false as const, error: "同じ教室・時間帯に既存の予定があるため変更できません。" }
            }
        }

        const slot = await prisma.openSlot.update({
            where: { id: slotId },
            data: updateData,
            include: {
                menu: {
                    select: {
                        id: true,
                        name: true,
                        durationMin: true,
                        price: true,
                        description: true,
                    },
                },
            },
        })

        revalidateSlotManagementViews()
        return { success: true as const, data: slot }
    } catch {
        return { success: false as const, error: "Failed to update slot" }
    }
}

export async function bulkDeleteDraftSlots(slotIds: string[]) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    try {
        const result = await prisma.openSlot.deleteMany({
            where: {
                id: { in: slotIds },
                isBooked: false,
                isPublic: false,
            }
        })

        revalidateSlotManagementViews()
        return { success: true as const, count: result.count }
    } catch {
        return { success: false as const, error: "Failed to delete slots" }
    }
}
