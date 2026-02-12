"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { BOOKING_RULES } from "@/lib/constants"

const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;

async function sendNotification(type: "BOOKING" | "RESCHEDULE" | "CANCEL", data: Record<string, unknown>) {
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

function isAdditionalPaidMenu(name: string, price: number) {
    if (price <= 0) return false
    return /追加|ad[\s_-]?hoc/i.test(name)
}

function isWithinStudentModificationWindow(lessonStart: Date) {
    const now = new Date()
    const diffInHours = (lessonStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    return diffInHours >= BOOKING_RULES.CANCELLATION_HOURS_BEFORE
}

function getLessonTypeFromMenuName(menuName?: string): "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL" {
    if (!menuName) return "REGULAR"
    const name = menuName.toLowerCase()
    if (name.includes("自主練") || name.includes("practice")) return "PRACTICE"
    if (name.includes("連弾") || name.includes("duet")) return "DUET_ADDITIONAL"
    if (name.includes("ソロ") || name.includes("solo")) return "SOLO_ADDITIONAL"
    if (name.includes("追加") || name.includes("ad_hoc") || name.includes("ad hoc")) return "AD_HOC"
    return "REGULAR"
}

export async function getBookableMenusForStudent() {
    try {
        const menus = await prisma.menu.findMany({
            orderBy: [{ price: "asc" }, { durationMin: "asc" }]
        })

        const additionalMenus = menus.filter((menu) => isAdditionalPaidMenu(menu.name, menu.price))
        return { success: true, data: additionalMenus }
    } catch (error) {
        console.error(error)
        return { success: false, error: "Failed to fetch bookable menus" }
    }
}

export async function getStudentCredits(userId: string) {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1 // 1-12

    const credit = await prisma.cancellationCredit.findUnique({
        where: {
            studentId_year_month: {
                studentId: userId,
                year,
                month,
            }
        }
    })

    return {
        count: credit?.count ?? 0,
        used: credit?.used ?? 0,
        remaining: (credit?.count ?? 0) - (credit?.used ?? 0)
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
                isPublic: true,
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

export async function getAvailableSlotsInRange(startStr: string, endStr: string) {
    try {
        const start = new Date(startStr)
        const end = new Date(endStr)

        const slots = await prisma.openSlot.findMany({
            where: {
                isBooked: false,
                isPublic: true,
                startTime: {
                    gte: start,
                    lte: end,
                },
            },
            select: {
                startTime: true
            }
        })
        return { success: true, data: slots }
    } catch (error) {
        return { success: false, error: "Failed to fetch slots" }
    }
}

type BookableStartTime = {
    startTime: Date
    endTime: Date
    roomId: string
    slotIds: string[]
}

function buildBookableStartTimes(
    slots: Array<{ id: string; roomId: string; startTime: Date; endTime: Date }>,
    durationMin: number
) {
    const requiredSlotCount = Math.max(1, Math.ceil(durationMin / 30))
    const byRoom = new Map<string, Array<{ id: string; roomId: string; startTime: Date; endTime: Date }>>()

    for (const slot of slots) {
        if (!byRoom.has(slot.roomId)) byRoom.set(slot.roomId, [])
        byRoom.get(slot.roomId)!.push(slot)
    }

    const candidates: BookableStartTime[] = []

    for (const [, roomSlots] of byRoom) {
        roomSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

        for (let i = 0; i < roomSlots.length; i++) {
            const chain = [roomSlots[i]]
            for (let j = i + 1; j < roomSlots.length && chain.length < requiredSlotCount; j++) {
                const prev = chain[chain.length - 1]
                const next = roomSlots[j]
                if (prev.endTime.getTime() === next.startTime.getTime()) {
                    chain.push(next)
                } else {
                    break
                }
            }

            if (chain.length === requiredSlotCount) {
                candidates.push({
                    startTime: chain[0].startTime,
                    endTime: chain[chain.length - 1].endTime,
                    roomId: chain[0].roomId,
                    slotIds: chain.map((s) => s.id),
                })
            }
        }
    }

    candidates.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    return candidates
}

export async function getBookableStartTimes(dateStr: string, menuId: string) {
    try {
        const menu = await prisma.menu.findUnique({ where: { id: menuId } })
        if (!menu) return { success: false, error: "メニューが見つかりません。" }

        const start = new Date(dateStr)
        start.setHours(0, 0, 0, 0)
        const end = new Date(dateStr)
        end.setHours(23, 59, 59, 999)

        const slots = await prisma.openSlot.findMany({
            where: {
                isBooked: false,
                isPublic: true,
                startTime: { gte: start, lte: end },
                OR: [{ menuId: null }, { menuId }],
            },
            select: {
                id: true,
                roomId: true,
                startTime: true,
                endTime: true,
            },
            orderBy: { startTime: "asc" },
        })

        const candidates = buildBookableStartTimes(slots, menu.durationMin)
        return { success: true, data: candidates }
    } catch (error) {
        console.error(error)
        return { success: false, error: "予約可能な時間枠の取得に失敗しました。" }
    }
}

export async function getBookableDaysInRange(startStr: string, endStr: string, menuId: string) {
    try {
        const menu = await prisma.menu.findUnique({ where: { id: menuId } })
        if (!menu) return { success: false, error: "メニューが見つかりません。" }

        const start = new Date(startStr)
        const end = new Date(endStr)
        const slots = await prisma.openSlot.findMany({
            where: {
                isBooked: false,
                isPublic: true,
                startTime: { gte: start, lte: end },
                OR: [{ menuId: null }, { menuId }],
            },
            select: {
                id: true,
                roomId: true,
                startTime: true,
                endTime: true,
            },
            orderBy: { startTime: "asc" },
        })

        const dates = new Set(
            buildBookableStartTimes(slots, menu.durationMin).map((slot) =>
                slot.startTime.toISOString().slice(0, 10)
            )
        )
        return { success: true, data: Array.from(dates) }
    } catch (error) {
        console.error(error)
        return { success: false, error: "予約可能日の取得に失敗しました。" }
    }
}

export async function bookLesson(slotIds: string[], menuId: string, useCredit: boolean = false) {
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
            const lessonType = getLessonTypeFromMenuName(menu?.name)

            // 4. Handle Credit Usage
            if (useCredit) {
                const today = new Date()
                const year = today.getFullYear()
                const month = today.getMonth() + 1

                const credit = await tx.cancellationCredit.findUnique({
                    where: {
                        studentId_year_month: {
                            studentId: session.user.id!,
                            year,
                            month,
                        }
                    }
                })

                if (!credit || credit.count - credit.used <= 0) {
                    throw new Error("振替チケットがありません。")
                }

                await tx.cancellationCredit.update({
                    where: { id: credit.id },
                    data: { used: { increment: 1 } }
                })
            }

            // 5. Look up teacher (first TEACHER user)
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
                    menuId,
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
            // 1. Fetch Lesson
            const lesson = await tx.lesson.findUnique({
                where: { id: lessonId },
            })
            if (!lesson || lesson.studentId !== session.user.id) {
                throw new Error("Lesson not found or unauthorized.")
            }

            // 2. Validate Cancellation Rules (24 hours prior)
            const lessonStart = new Date(lesson.startTime)
            if (!isWithinStudentModificationWindow(lessonStart)) {
                throw new Error(`日程変更はレッスン開始の${BOOKING_RULES.CANCELLATION_HOURS_BEFORE / 24}日前まで可能です。`)
            }

            // 3. Check Credit Limit (Max 2 per month - placeholder, adjust as needed)
            // The requirement says "当月中のみ有効", so we check the month of the lesson.
            const year = lessonStart.getFullYear()
            const month = lessonStart.getMonth() + 1

            const credit = await tx.cancellationCredit.findUnique({
                where: {
                    studentId_year_month: {
                        studentId: session.user.id!,
                        year,
                        month
                    }
                }
            })

            // Actually, for rescheduling, we might want to check the REMAINING credits.
            // If they are rescheduling a regular lesson, they just need "reschedule rights".
            // Let's assume they have 2 rights per month.
            const currentCount = credit?.count ?? 0
            if (currentCount >= 2) {
                throw new Error("今月の振替回数上限（2回）に達しています。")
            }

            // 4. Verify new slots
            const newSlots = await tx.openSlot.findMany({
                where: { id: { in: slotIds } },
            })
            if (newSlots.some(s => s.isBooked)) {
                throw new Error("選択された枠は埋まってしまいました。")
            }

            const sortedSlots = newSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            const newStart = sortedSlots[0].startTime
            const newEnd = sortedSlots[sortedSlots.length - 1].endTime

            // 5. Update Credit Usage
            await tx.cancellationCredit.upsert({
                where: {
                    studentId_year_month: {
                        studentId: session.user.id!,
                        year,
                        month
                    }
                },
                update: {
                    count: { increment: 1 },
                    used: { increment: 1 }
                },
                create: {
                    studentId: session.user.id!,
                    year,
                    month,
                    count: 1,
                    used: 1
                }
            })

            // 6. Update Lesson
            await tx.lesson.update({
                where: { id: lessonId },
                data: {
                    startTime: newStart,
                    endTime: newEnd,
                    roomId: sortedSlots[0].roomId,
                    updatedAt: new Date(),
                }
            })

            // 7. Mark new slots booked
            await tx.openSlot.updateMany({
                where: { id: { in: slotIds } },
                data: { isBooked: true },
            })

            // 8. Free old slots
            await tx.openSlot.updateMany({
                where: {
                    startTime: lesson.startTime,
                    endTime: lesson.endTime,
                    roomId: lesson.roomId ?? undefined,
                    isBooked: true
                },
                data: { isBooked: false }
            })

            revalidatePath("/student")
            revalidatePath("/teacher/schedule")

            sendNotification("RESCHEDULE", {
                studentId: session.user.id,
                oldStartTime: lesson.startTime,
                newStartTime: newStart,
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

            if (session.user.role !== "TEACHER" && lesson.studentId !== session.user.id) {
                throw new Error("このレッスンをキャンセルする権限がありません。")
            }

            if (lesson.status === "CANCELLED") {
                throw new Error("このレッスンはすでにキャンセル済みです。")
            }

            const lessonStart = new Date(lesson.startTime)
            const isEligibleForCredit = isWithinStudentModificationWindow(lessonStart)

            if (session.user.role !== "TEACHER" && !isEligibleForCredit) {
                throw new Error(`キャンセルはレッスン開始の${BOOKING_RULES.CANCELLATION_HOURS_BEFORE / 24}日前まで可能です。`)
            }

            // 1. Cancel the lesson
            await tx.lesson.update({
                where: { id: lessonId },
                data: { status: "CANCELLED" },
            })

            // 2. Grant Credit if eligible (24 hours prior)
            if (isEligibleForCredit && session.user.role !== "TEACHER") {
                const year = lessonStart.getFullYear()
                const month = lessonStart.getMonth() + 1

                await tx.cancellationCredit.upsert({
                    where: {
                        studentId_year_month: {
                            studentId: lesson.studentId,
                            year,
                            month
                        }
                    },
                    update: {
                        count: { increment: 1 }
                    },
                    create: {
                        studentId: lesson.studentId,
                        year,
                        month,
                        count: 1,
                        used: 0
                    }
                })
            }

            // 3. Free up the open slot 
            // Only if it's > 24h OR if the teacher is the one cancelling?
            // Actually, let's always free the slot so it can be reused, even if student loses credit.
            await tx.openSlot.updateMany({
                where: {
                    startTime: lesson.startTime,
                    endTime: lesson.endTime,
                    roomId: lesson.roomId ?? undefined,
                    isBooked: true,
                },
                data: { isBooked: false },
            })

            revalidatePath("/student")
            revalidatePath("/teacher/schedule")

            sendNotification("CANCEL", {
                studentId: lesson.studentId,
                startTime: lesson.startTime,
                eligibleForCredit: isEligibleForCredit,
                lessonId,
            })

            return { success: true }
        })
    } catch (error) {
        console.error(error)
        return { success: false, error: error instanceof Error ? error.message : "キャンセルに失敗しました" }
    }
}
