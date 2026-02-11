"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { addMinutes } from "date-fns"

export async function getOpenSlots(roomId: string, start: Date, end: Date) {
    try {
        const slots = await prisma.openSlot.findMany({
            where: {
                roomId,
                startTime: {
                    gte: start,
                    lt: end,
                },
            },
        })
        return { success: true, data: slots }
    } catch (error) {
        console.error("Failed to fetch slots:", error)
        return { success: false, error: "Failed to fetch slots" }
    }
}

export async function toggleOpenSlot(roomId: string, startTimeIso: string) {
    const startTime = new Date(startTimeIso)
    const endTime = addMinutes(startTime, 30)

    try {
        // Check if slot exists
        const existingSlot = await prisma.openSlot.findFirst({
            where: {
                roomId,
                startTime,
            },
        })

        if (existingSlot) {
            // If booked, don't delete
            if (existingSlot.isBooked) {
                return { success: false, error: "Cannot remove a booked slot" }
            }
            // Delete
            await prisma.openSlot.delete({
                where: { id: existingSlot.id },
            })
        } else {
            // Create
            await prisma.openSlot.create({
                data: {
                    roomId,
                    startTime,
                    endTime,
                },
            })
        }

        revalidatePath("/teacher/schedule")
        return { success: true }
    } catch (error) {
        console.error("Failed to toggle slot:", error)
        return { success: false, error: "Failed to update slot" }
    }
}
