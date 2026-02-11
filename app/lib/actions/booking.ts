"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export async function getMenus() {
    try {
        const menus = await prisma.menu.findMany()
        return { success: true, data: menus }
    } catch (error) {
        return { success: false, error: "Failed to fetch menus" }
    }
}

export async function getAvailableSlots(dateStr: string) {
    // Simple fetch of open slots for a specific date
    // Real implementation might need to handle duration > 30 mins (finding contiguous slots)
    try {
        const start = new Date(dateStr)
        start.setHours(0, 0, 0, 0)
        const end = new Date(dateStr)
        end.setHours(23, 59, 59, 999)

        const slots = await prisma.openSlot.findMany({
            where: {
                isBooked: false,
                startTime: {
                    gte: start,
                    lte: end,
                },
            },
            orderBy: { startTime: "asc" },
        })
        return { success: true, data: slots }
    } catch (error) {
        return { success: false, error: "Failed to fetch slots" }
    }
}

export async function bookLesson(slotIds: string[], menuId: string) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Verify slots are still open
            const slots = await tx.openSlot.findMany({
                where: { id: { in: slotIds } },
            })

            if (slots.some((s) => s.isBooked)) {
                throw new Error("One or more selected slots are no longer available.")
            }

            // 2. Mark slots as booked
            await tx.openSlot.updateMany({
                where: { id: { in: slotIds } },
                data: { isBooked: true },
            })

            // 3. Create Lesson
            // Assuming single slot for MVP, or taking start of first slot and end of last
            const sortedSlots = slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            const startTime = sortedSlots[0].startTime
            const endTime = sortedSlots[sortedSlots.length - 1].endTime

            await tx.lesson.create({
                data: {
                    studentId: session.user.id!,
                    teacherId: "teacher-id-placeholder", // We might need to store teacherId on OpenSlot or look it up
                    startTime,
                    endTime,
                    status: "BOOKED",
                    type: "REGULAR", // or derive from Menu
                },
            })

            revalidatePath("/student")
            revalidatePath("/teacher/schedule")
            return { success: true }
        })
    } catch (error) {
        console.error(error)
        return { success: false, error: "Booking failed. Please try again." }
    }
}
