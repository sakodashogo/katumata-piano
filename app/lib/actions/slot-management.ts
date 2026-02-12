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

export async function getMenusForSlots() {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false as const, error: "Unauthorized" }

    try {
        const menus = await prisma.menu.findMany({
            where: {
                name: { in: ['自主練習', 'ソロ追加', '連弾追加'] }
            }
        })
        return { success: true as const, data: menus }
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
        const monthStart = startOfMonth(new Date(input.year, input.month - 1))
        const monthEnd = endOfMonth(monthStart)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
        const matchingDays = allDays.filter(day => input.weekdays.includes(getDay(day)))

        // Get existing slots for overlap check
        const existingSlots = await prisma.openSlot.findMany({
            where: {
                startTime: { gte: monthStart, lte: monthEnd },
                roomId: { in: input.roomIds },
            },
            select: { startTime: true, endTime: true, roomId: true },
        })

        const existingSet = new Set(
            existingSlots.map(s => `${s.roomId}_${s.startTime.getTime()}`)
        )

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
                        const key = `${roomId}_${current.getTime()}`
                        if (!existingSet.has(key)) {
                            slotsToCreate.push({
                                roomId,
                                startTime: current,
                                endTime: slotEnd,
                                menuId: input.menuId || undefined,
                                durationMin: input.durationMin,
                                isPublic: false,
                            })
                        }
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

        if (data.durationMin !== undefined) {
            updateData.durationMin = data.durationMin
            updateData.endTime = addMinutes(existing.startTime, data.durationMin)
        }

        if (data.menuId !== undefined) {
            updateData.menuId = data.menuId
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
