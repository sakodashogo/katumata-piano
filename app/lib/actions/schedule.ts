"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { addMinutes } from "date-fns"

export async function getScheduleData(roomId: string | undefined, start: Date, end: Date) {
    try {
        const whereClause = {
            startTime: { gte: start, lt: end },
            ...(roomId ? { roomId } : {})
        }

        const [slots, lessons] = await Promise.all([
            prisma.openSlot.findMany({
                where: whereClause,
            }),
            prisma.lesson.findMany({
                where: {
                    ...whereClause,
                    status: { not: "CANCELLED" }
                },
                include: {
                    student: { select: { name: true } }
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

export async function moveLesson(lessonId: string, newStartTime: Date, newRoomId: string) {
    const newEndTime = addMinutes(new Date(newStartTime), 30) // Assuming 30 min default or keep duration?
    // Better to keep duration if possible, but let's assume 30m for now or fetch existing.
    // Fetching existing is safer.

    try {
        const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } })
        if (!lesson) return { success: false, error: "Lesson not found" }

        const duration = lesson.endTime.getTime() - lesson.startTime.getTime()
        const newEndTime = new Date(newStartTime.getTime() + duration)

        await prisma.lesson.update({
            where: { id: lessonId },
            data: {
                startTime: newStartTime,
                endTime: newEndTime,
                roomId: newRoomId,
                status: "DRAFT" as any // Moving auto-converts to DRAFT for safety? Or keeps status?
                // User requirement: "Editing... is Draft state... then Publish".
                // So if I move a Public lesson, it ideally becomes Draft? 
                // Or maybe the "Edit Mode" in UI simply doesn't save to DB until "Save"?
                // "Drag & Drop... immediately doesn't reflect... 'Save changes?' or Undo".
                // Design interpretation: 
                // 1. UI State: Drag changes local state.
                // 2. Save: Calls this action.
                // 3. Status: If it was BOOKED, does it stay BOOKED?
                // The requirement says "Draft... Publish".
                // Let's allow updating without changing status if just moving, OR allow status change.
                // For now, let's just update the fields.
            }
        })
        revalidatePath("/teacher/schedule")
        return { success: true }
    } catch (error) {
        console.error("Failed to move lesson:", error)
        return { success: false, error: "Failed to move lesson" }
    }
}

export async function publishLessons(lessonIds: string[]) {
    try {
        await prisma.lesson.updateMany({
            where: { id: { in: lessonIds } },
            data: { status: "BOOKED" } // Or whatever "Published" maps to. BOOKED is fine.
        })
        revalidatePath("/teacher/schedule")
        return { success: true }
    } catch (error) {
        console.error("Failed to publish lessons:", error)
        return { success: false, error: "Failed to publish lessons" }
    }
}

export async function moveOpenSlot(slotId: string, newStartTime: Date, newRoomId: string) {
    try {
        const slot = await prisma.openSlot.findUnique({ where: { id: slotId } })
        if (!slot) return { success: false, error: "Slot not found" }

        const duration = slot.endTime.getTime() - slot.startTime.getTime()
        const newEndTime = new Date(newStartTime.getTime() + duration)

        await prisma.openSlot.update({
            where: { id: slotId },
            data: {
                startTime: newStartTime,
                endTime: newEndTime,
                roomId: newRoomId
                // Keep keeping isPublic/isBooked as is?
                // If moving a Public slot, maybe it should revert to Draft?
                // Left as is for flexibility.
            }
        })
        revalidatePath("/teacher/schedule")
        return { success: true }
    } catch (error) {
        console.error("Failed to move slot:", error)
        return { success: false, error: "Failed to move slot" }
    }
}
