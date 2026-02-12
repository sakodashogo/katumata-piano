"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;

async function sendNotification(type: "BOOKING" | "RESCHEDULE" | "CANCEL", data: any) {
    if (!GAS_WEBHOOK_URL) return;
    try {
        await fetch(GAS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, ...data }),
        });
    } catch (e) {
        console.error("Failed to send notification:", e);
    }
}

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
                throw new Error("選択された枠はすでに予約済みです。")
            }

            // 2. Mark slots as booked
            await tx.openSlot.updateMany({
                where: { id: { in: slotIds } },
                data: { isBooked: true },
            })

            // 3. Look up menu to determine lesson type
            const menu = await tx.menu.findUnique({ where: { id: menuId } })
            let lessonType: "REGULAR" | "AD_HOC" | "PRACTICE" = "REGULAR"
            if (menu) {
                const name = menu.name.toLowerCase()
                if (name.includes("自主練") || name.includes("practice")) {
                    lessonType = "PRACTICE"
                } else if (name.includes("追加") || name.includes("ad_hoc") || name.includes("ad hoc")) {
                    lessonType = "AD_HOC"
                }
            }

            // 4. Look up teacher (first TEACHER user)
            const teacher = await tx.user.findFirst({ where: { role: "TEACHER" } })

            // 5. Create Lesson
            const sortedSlots = slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            const startTime = sortedSlots[0].startTime
            const endTime = sortedSlots[sortedSlots.length - 1].endTime

            await tx.lesson.create({
                data: {
                    studentId: session.user.id!,
                    teacherId: teacher?.id ?? null,
                    startTime,
                    endTime,
                    status: "BOOKED",
                    type: lessonType,
                },
            })

            revalidatePath("/student")
            revalidatePath("/teacher/schedule")

            // Send Notification (Fire and forget)
            sendNotification("BOOKING", {
                studentId: session.user.id,
                startTime,
                menuId
            });

            return { success: true }
        })
    } catch (error) {
        console.error(error)
        return { success: false, error: "Booking failed. Please try again." }
    }
}

export async function rescheduleLesson(lessonId: string, slotIds: string[]) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Verify Lesson ownership and status
            const lesson = await tx.lesson.findUnique({
                where: { id: lessonId },
                include: { student: true }
            })

            if (!lesson || lesson.studentId !== session.user.id) {
                throw new Error("Lesson not found or unauthorized.")
            }

            // 2. Verify new slots are available
            const newSlots = await tx.openSlot.findMany({
                where: { id: { in: slotIds } },
            })
            if (newSlots.some((s) => s.isBooked)) {
                throw new Error("Selected slots are no longer available.")
            }

            // 3. Mark new slots as booked
            await tx.openSlot.updateMany({
                where: { id: { in: slotIds } },
                data: { isBooked: true },
            })

            // 4. Calculate new time
            const sortedSlots = newSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            const startTime = sortedSlots[0].startTime
            const endTime = sortedSlots[sortedSlots.length - 1].endTime

            // 5. Update Lesson
            const updatedLesson = await tx.lesson.update({
                where: { id: lessonId },
                data: {
                    startTime,
                    endTime,
                    status: "BOOKED", // Ensure it's active
                    updatedAt: new Date(),
                }
            })

            // 6. Try to free up old slots (Best effort)
            // find open slots that match the OLD time and mark them as unbooked
            await tx.openSlot.updateMany({
                where: {
                    startTime: lesson.startTime,
                    endTime: lesson.endTime,
                    roomId: "A", // Defaulting to A for now as we don't have room in Lesson model yet
                },
                data: { isBooked: false }
            })

            revalidatePath("/student")
            revalidatePath("/teacher/schedule")

            sendNotification("RESCHEDULE", {
                studentId: session.user.id,
                oldStartTime: lesson.startTime,
                newStartTime: startTime,
                lessonId
            });

            return { success: true }
        })
    } catch (error) {
        console.error(error)
        return { success: false, error: error instanceof Error ? error.message : "Reschedule failed" }
    }
}

export async function cancelLesson(lessonId: string) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    try {
        return await prisma.$transaction(async (tx) => {
            const lesson = await tx.lesson.findUnique({
                where: { id: lessonId },
            })

            if (!lesson) {
                throw new Error("レッスンが見つかりません。")
            }

            // Students can only cancel their own lessons; teachers can cancel any
            if (session.user.role !== "TEACHER" && lesson.studentId !== session.user.id) {
                throw new Error("このレッスンをキャンセルする権限がありません。")
            }

            if (lesson.status === "CANCELLED") {
                throw new Error("このレッスンはすでにキャンセル済みです。")
            }

            // 1. Cancel the lesson
            await tx.lesson.update({
                where: { id: lessonId },
                data: { status: "CANCELLED" },
            })

            // 2. Free up the open slot (best effort)
            await tx.openSlot.updateMany({
                where: {
                    startTime: lesson.startTime,
                    endTime: lesson.endTime,
                    isBooked: true,
                },
                data: { isBooked: false },
            })

            revalidatePath("/student")
            revalidatePath("/teacher/schedule")

            sendNotification("CANCEL", {
                studentId: lesson.studentId,
                startTime: lesson.startTime,
                lessonId,
            })

            return { success: true }
        })
    } catch (error) {
        console.error(error)
        return { success: false, error: error instanceof Error ? error.message : "キャンセルに失敗しました" }
    }
}
