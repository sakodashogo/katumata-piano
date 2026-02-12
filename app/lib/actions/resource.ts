'use server'

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

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
    } catch (error) {
        return { success: false, error: "Failed to fetch slots" }
    }
}

export async function createOpenSlot(data: { roomId: string, startTime: Date, endTime: Date, menuId?: string, durationMin?: number }) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
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
        return { success: true, data: slot }
    } catch (error) {
        return { success: false, error: "Failed to create slot" }
    }
}

export async function updateOpenSlot(id: string, data: { roomId?: string, startTime?: Date, endTime?: Date, isPublic?: boolean, menuId?: string | null, durationMin?: number }) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
        const slot = await prisma.openSlot.update({
            where: { id },
            data
        })
        revalidatePath('/teacher/resources')
        return { success: true, data: slot }
    } catch (error) {
        return { success: false, error: "Failed to update slot" }
    }
}

export async function deleteOpenSlot(id: string) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
        await prisma.openSlot.delete({
            where: { id }
        })
        revalidatePath('/teacher/resources')
        return { success: true }
    } catch (error) {
        return { success: false, error: "Failed to delete slot" }
    }
}

export async function publishOpenSlots(ids: string[]) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    try {
        await prisma.openSlot.updateMany({
            where: { id: { in: ids } },
            data: { isPublic: true }
        })
        revalidatePath('/teacher/resources')
        revalidatePath('/teacher/slots')
        revalidatePath('/student/book') // Revalidate student booking page
        return { success: true }
    } catch (error) {
        return { success: false, error: "Failed to publish slots" }
    }
}
