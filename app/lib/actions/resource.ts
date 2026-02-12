'use server'

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addMinutes } from "date-fns"

async function hasRoomTimeConflict(args: {
    roomId: string
    startTime: Date
    endTime: Date
    excludeSlotId?: string
}) {
    const [slotConflict, lessonConflict] = await Promise.all([
        prisma.openSlot.findFirst({
            where: {
                id: args.excludeSlotId ? { not: args.excludeSlotId } : undefined,
                roomId: args.roomId,
                startTime: { lt: args.endTime },
                endTime: { gt: args.startTime },
            },
            select: { id: true },
        }),
        prisma.lesson.findFirst({
            where: {
                status: { not: "CANCELLED" },
                roomId: args.roomId,
                startTime: { lt: args.endTime },
                endTime: { gt: args.startTime },
            },
            select: { id: true },
        }),
    ])

    return !!slotConflict || !!lessonConflict
}

export async function getOpenSlots(year: number, month: number) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59, 999)

    try {
        const slots = await prisma.openSlot.findMany({
            where: {
                startTime: {
                    gte: start,
                    lte: end,
                }
            },
            include: { menu: true },
            orderBy: { startTime: 'asc' }
        })
        return { success: true, data: slots }
    } catch {
        return { success: false, error: "Failed to fetch slots" }
    }
}

export async function createOpenSlot(data: { roomId: string, startTime: Date, endTime: Date, menuId?: string, durationMin?: number }) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
        if (data.startTime >= data.endTime) {
            return { success: false, error: "開始時刻は終了時刻より前に設定してください。" }
        }

        const hasConflict = await hasRoomTimeConflict({
            roomId: data.roomId,
            startTime: data.startTime,
            endTime: data.endTime,
        })
        if (hasConflict) {
            return { success: false, error: "同じ教室・時間帯に既存の予定があるため作成できません。" }
        }

        const slot = await prisma.openSlot.create({
            data: {
                roomId: data.roomId,
                startTime: data.startTime,
                endTime: data.endTime,
                isPublic: false,
                ...(data.menuId && { menuId: data.menuId }),
                ...(data.durationMin && { durationMin: data.durationMin }),
            }
        })
        revalidatePath('/teacher/resources')
        revalidatePath('/teacher/schedule')
        return { success: true, data: slot }
    } catch {
        return { success: false, error: "Failed to create slot" }
    }
}

export async function updateOpenSlot(id: string, data: { roomId?: string, startTime?: Date, endTime?: Date, isPublic?: boolean, menuId?: string | null, durationMin?: number }) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
        const existing = await prisma.openSlot.findUnique({ where: { id } })
        if (!existing) {
            return { success: false, error: "Slot not found" }
        }

        if (existing.isBooked && (data.roomId || data.startTime || data.endTime || data.durationMin)) {
            return { success: false, error: "予約済みの枠は日時変更できません。" }
        }

        const nextRoomId = data.roomId ?? existing.roomId
        const nextStartTime = data.startTime ?? existing.startTime
        let nextEndTime = data.endTime ?? existing.endTime

        if (data.durationMin !== undefined && !data.endTime) {
            nextEndTime = addMinutes(nextStartTime, data.durationMin)
        }

        if (nextStartTime >= nextEndTime) {
            return { success: false, error: "開始時刻は終了時刻より前に設定してください。" }
        }

        const shouldValidateOverlap =
            nextRoomId !== existing.roomId ||
            nextStartTime.getTime() !== existing.startTime.getTime() ||
            nextEndTime.getTime() !== existing.endTime.getTime()

        if (shouldValidateOverlap) {
            const hasConflict = await hasRoomTimeConflict({
                roomId: nextRoomId,
                startTime: nextStartTime,
                endTime: nextEndTime,
                excludeSlotId: id,
            })
            if (hasConflict) {
                return { success: false, error: "同じ教室・時間帯に既存の予定があるため更新できません。" }
            }
        }

        const slot = await prisma.openSlot.update({
            where: { id },
            data: {
                ...data,
                ...(data.durationMin !== undefined && !data.endTime ? { endTime: nextEndTime } : {}),
            }
        })
        revalidatePath('/teacher/resources')
        revalidatePath('/teacher/schedule')
        return { success: true, data: slot }
    } catch {
        return { success: false, error: "Failed to update slot" }
    }
}

export async function deleteOpenSlot(id: string) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
        const slot = await prisma.openSlot.findUnique({ where: { id }, select: { isBooked: true } })
        if (!slot) return { success: false, error: "Slot not found" }
        if (slot.isBooked) return { success: false, error: "予約済みの枠は削除できません。" }

        await prisma.openSlot.delete({
            where: { id }
        })
        revalidatePath('/teacher/resources')
        revalidatePath('/teacher/schedule')
        return { success: true }
    } catch {
        return { success: false, error: "Failed to delete slot" }
    }
}

export async function publishOpenSlots(ids: string[]) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
        await prisma.openSlot.updateMany({
            where: {
                id: { in: ids },
                isBooked: false,
            },
            data: { isPublic: true }
        })
        revalidatePath('/teacher/resources')
        revalidatePath('/teacher/slots')
        revalidatePath('/student/book') // Revalidate student booking page
        return { success: true }
    } catch {
        return { success: false, error: "Failed to publish slots" }
    }
}
