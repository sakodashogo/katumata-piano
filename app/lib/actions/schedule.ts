"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { addMinutes } from "date-fns"

export async function getScheduleData(roomId: string, start: Date, end: Date) {
    try {
        const [slots, lessons] = await Promise.all([
            prisma.openSlot.findMany({
                where: {
                    roomId,
                    startTime: { gte: start, lt: end },
                },
            }),
            prisma.lesson.findMany({
                where: {
                    // @ts-expect-error roomId might be missing in generated types
                    roomId,
                    startTime: { gte: start, lt: end },
                    status: { not: "CANCELLED" }
                }
            })
        ])
        return { success: true, data: { slots, lessons } }
    } catch (error) {
        console.error("Failed to fetch schedule data:", error)
        return { success: false, error: "Failed to fetch schedule data" }
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

export async function bulkUpdateOpenSlots(roomId: string, slots: string[], action: 'add' | 'remove') {
    try {
        if (action === 'add') {
            // Filter out existing slots to avoid duplicates if any
            // Actually createMany with skipDuplicates is not supported in SQLite (if used) or depending on DB.
            // But prisma.openSlot might allow duplicates if no unique constraint?
            // "OpenSlot" usually has no unique constraint on (roomId, startTime) in default generated schemas unless specified.
            // Let's assume we want to avoid duplicates.

            // 1. Find existing slots
            const existing = await prisma.openSlot.findMany({
                where: {
                    roomId,
                    startTime: { in: slots.map(d => new Date(d)) }
                },
                select: { startTime: true }
            })

            const existingTimes = new Set(existing.map(e => e.startTime.getTime()))

            const newSlots = slots
                .map(s => new Date(s))
                .filter(d => !existingTimes.has(d.getTime()))
                .map(d => ({
                    roomId,
                    startTime: d,
                    endTime: addMinutes(d, 30),
                    isBooked: false
                }))

            if (newSlots.length > 0) {
                await prisma.openSlot.createMany({
                    data: newSlots
                })
            }
        } else {
            // Remove
            // Only remove if NOT booked
            await prisma.openSlot.deleteMany({
                where: {
                    roomId,
                    startTime: { in: slots.map(d => new Date(d)) },
                    isBooked: false // Safety check
                }
            })
        }

        revalidatePath("/teacher/schedule")
        return { success: true }
    } catch (error) {
        console.error("Failed to bulk update slots:", error)
        return { success: false, error: "Failed to bulk update slots" }
    }
}
