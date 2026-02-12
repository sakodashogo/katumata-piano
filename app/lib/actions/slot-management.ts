'use server'

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import {
    eachDayOfInterval,
    startOfMonth,
    endOfMonth,
    getDay,
    setHours,
    setMinutes,
    addMinutes,
} from "date-fns"
import { isStudentBookableMenu } from "@/lib/menu-category"

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
        for (const range of input.timeRanges) {
            if (range.start >= range.end) {
                return { success: false as const, error: "時間帯の開始は終了より前に設定してください。" }
            }
        }

        const monthStart = startOfMonth(new Date(input.year, input.month - 1))
        const monthEnd = endOfMonth(monthStart)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
        const matchingDays = allDays.filter(day => input.weekdays.includes(getDay(day)))

        const [existingSlots, existingLessons] = await Promise.all([
            prisma.openSlot.findMany({
                where: {
                    startTime: { gte: monthStart, lte: monthEnd },
                    roomId: { in: input.roomIds },
                },
                select: { startTime: true, endTime: true, roomId: true },
            }),
            prisma.lesson.findMany({
                where: {
                    status: { not: "CANCELLED" },
                    roomId: { in: input.roomIds },
                    startTime: { lt: monthEnd },
                    endTime: { gt: monthStart },
                },
                select: { startTime: true, endTime: true, roomId: true },
            }),
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

        for (const day of matchingDays) {
            for (const range of input.timeRanges) {
                const [startH, startM] = range.start.split(':').map(Number)
                const [endH, endM] = range.end.split(':').map(Number)
                const rangeStart = setMinutes(setHours(day, startH), startM)
                const rangeEnd = setMinutes(setHours(day, endH), endM)

                let current = rangeStart
                while (addMinutes(current, input.durationMin) <= rangeEnd) {
                    const slotEnd = addMinutes(current, input.durationMin)

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
            return { success: true as const, count: 0 }
        }

        await prisma.openSlot.createMany({ data: slotsToCreate })

        revalidatePath('/teacher/slots')
        return { success: true as const, count: slotsToCreate.length }
    } catch {
        return { success: false as const, error: "Failed to batch create slots" }
    }
}

export async function getDraftSlots(year: number, month: number) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59, 999)

    try {
        const slots = await prisma.openSlot.findMany({
            where: {
                startTime: { gte: start, lte: end },
                isPublic: false,
                isBooked: false,
            },
            include: { menu: true },
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

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59, 999)

    try {
        const slots = await prisma.openSlot.findMany({
            where: {
                startTime: { gte: start, lte: end },
            },
            include: { menu: true },
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
            include: { menu: true },
        })

        revalidatePath('/teacher/slots')
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

        revalidatePath('/teacher/slots')
        return { success: true as const, count: result.count }
    } catch {
        return { success: false as const, error: "Failed to delete slots" }
    }
}
