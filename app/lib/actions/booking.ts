"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { BOOKING_RULES } from "@/lib/constants"
import { Prisma } from "@prisma/client"
import { isStudentBookableMenu, toLessonTypeFromMenu } from "@/lib/menu-category"
import { notifyEvent } from "@/lib/notifications"
import { getSupportShiftsInRangeSafe } from "@/lib/support-shifts"

export async function getMenus() {
    try {
        const menus = await prisma.menu.findMany({
            select: {
                id: true,
                name: true,
                durationMin: true,
                price: true,
                description: true,
            },
        })
        return { success: true, data: menus }
    } catch {
        return { success: false, error: "Failed to fetch menus" }
    }
}

function isWithinStudentModificationWindow(lessonStart: Date) {
    const now = new Date()
    const diffInHours = (lessonStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    return diffInHours >= BOOKING_RULES.CANCELLATION_HOURS_BEFORE
}

function addDays(base: Date, days: number) {
    const result = new Date(base)
    result.setDate(result.getDate() + days)
    return result
}

function getMonthRange(target: Date) {
    const start = new Date(target.getFullYear(), target.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(target.getFullYear(), target.getMonth() + 1, 1, 0, 0, 0, 0)
    return { start, end }
}

function ensureContiguousSlots(
    slots: Array<{ id: string; roomId: string; startTime: Date; endTime: Date }>
) {
    if (slots.length === 0) {
        throw new Error("予約枠を選択してください。")
    }

    const sortedSlots = [...slots].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    const roomId = sortedSlots[0].roomId
    if (sortedSlots.some((slot) => slot.roomId !== roomId)) {
        throw new Error("同じ部屋の連続した枠を選択してください。")
    }

    for (let i = 1; i < sortedSlots.length; i++) {
        if (sortedSlots[i - 1].endTime.getTime() !== sortedSlots[i].startTime.getTime()) {
            throw new Error("連続した時間枠を選択してください。")
        }
    }

    return {
        sortedSlots,
        roomId,
        startTime: sortedSlots[0].startTime,
        endTime: sortedSlots[sortedSlots.length - 1].endTime,
    }
}

async function assertNoReservationConflict(
    tx: Prisma.TransactionClient,
    options: {
        startTime: Date
        endTime: Date
        roomId: string
        studentId: string
        ignoreLessonId?: string
    }
) {
    const roomConflict = await tx.lesson.findFirst({
        where: {
            id: options.ignoreLessonId ? { not: options.ignoreLessonId } : undefined,
            status: { not: "CANCELLED" },
            roomId: options.roomId,
            startTime: { lt: options.endTime },
            endTime: { gt: options.startTime },
        },
        select: { id: true },
    })
    if (roomConflict) {
        throw new Error("同じ時間帯に別の予約が入りました。別の時間を選択してください。")
    }

    const studentConflict = await tx.lesson.findFirst({
        where: {
            id: options.ignoreLessonId ? { not: options.ignoreLessonId } : undefined,
            status: { not: "CANCELLED" },
            studentId: options.studentId,
            startTime: { lt: options.endTime },
            endTime: { gt: options.startTime },
        },
        select: { id: true },
    })
    if (studentConflict) {
        throw new Error("同じ時間帯に既存の予約があります。日時をご確認ください。")
    }
}

export async function getBookableMenusForStudent() {
    try {
        const menus = await prisma.menu.findMany({
            select: {
                id: true,
                name: true,
                durationMin: true,
                price: true,
                description: true,
            },
            orderBy: [{ price: "asc" }, { durationMin: "asc" }]
        })

        const studentBookableMenus = menus.filter((menu) =>
            isStudentBookableMenu(menu as { name?: string | null; category?: unknown })
        )
        return { success: true, data: studentBookableMenus }
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
        remaining: Math.max((credit?.count ?? 0) - (credit?.used ?? 0), 0)
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
    } catch {
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
    } catch {
        return { success: false, error: "Failed to fetch slots" }
    }
}

type BookableStartTime = {
    startTime: Date
    endTime: Date
    roomId: string
    slotIds: string[]
}

function requiresSupportForRoomB(lessonType: string) {
    return lessonType !== "PRACTICE"
}

function hasSupportOverlap(
    shifts: Array<{ startTime: Date; endTime: Date }>,
    startTime: Date,
    endTime: Date
) {
    return shifts.some((shift) => shift.startTime < endTime && shift.endTime > startTime)
}

function buildBookableStartTimes(
    slots: Array<{ id: string; roomId: string; startTime: Date; endTime: Date }>,
    durationMin: number
) {
    const requiredDuration = Math.max(30, durationMin)
    const byRoom = new Map<string, Array<{ id: string; roomId: string; startTime: Date; endTime: Date }>>()

    for (const slot of slots) {
        if (!byRoom.has(slot.roomId)) byRoom.set(slot.roomId, [])
        byRoom.get(slot.roomId)!.push(slot)
    }

    const candidates: BookableStartTime[] = []

    for (const [, roomSlots] of byRoom) {
        roomSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

        for (let i = 0; i < roomSlots.length; i++) {
            const chain: Array<{ id: string; roomId: string; startTime: Date; endTime: Date }> = [roomSlots[i]]
            const chainStart = roomSlots[i].startTime
            let chainEnd = roomSlots[i].endTime

            if ((chainEnd.getTime() - chainStart.getTime()) / 60000 >= requiredDuration) {
                candidates.push({
                    startTime: chainStart,
                    endTime: chainEnd,
                    roomId: roomSlots[i].roomId,
                    slotIds: chain.map((s) => s.id),
                })
                continue
            }

            for (let j = i + 1; j < roomSlots.length; j++) {
                const prev = chain[chain.length - 1]
                const next = roomSlots[j]
                if (prev.endTime.getTime() !== next.startTime.getTime()) {
                    break
                }
                chain.push(next)
                chainEnd = next.endTime

                if ((chainEnd.getTime() - chainStart.getTime()) / 60000 >= requiredDuration) {
                    candidates.push({
                        startTime: chainStart,
                        endTime: chainEnd,
                        roomId: chain[0].roomId,
                        slotIds: chain.map((s) => s.id),
                    })
                    break
                }
            }
        }
    }

    candidates.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    return candidates
}

export async function getBookableStartTimes(dateStr: string, menuId: string, dateEndStr?: string) {
    try {
        const menu = await prisma.menu.findUnique({
            where: { id: menuId },
            select: {
                id: true,
                name: true,
                durationMin: true,
                price: true,
                description: true,
            },
        })
        if (!menu) return { success: false, error: "メニューが見つかりません。" }

        const start = new Date(dateStr)
        const end = dateEndStr ? new Date(dateEndStr) : new Date(dateStr)
        if (!dateEndStr) {
            start.setHours(0, 0, 0, 0)
            end.setHours(23, 59, 59, 999)
        }

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return { success: false, error: "日付指定が不正です。" }
        }

        const lessonType = toLessonTypeFromMenu(menu as { name?: string | null; category?: unknown })

        const slots = await prisma.openSlot.findMany({
            where: {
                isBooked: false,
                isPublic: true,
                startTime: { gte: start, lt: end },
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

        const supportShifts = await getSupportShiftsInRangeSafe(start, end)
        const filtered = slots.filter((slot) => {
            if (slot.roomId !== "B") return true
            if (!requiresSupportForRoomB(lessonType)) return true
            return hasSupportOverlap(supportShifts, slot.startTime, slot.endTime)
        })

        const candidates = buildBookableStartTimes(filtered, menu.durationMin)
        return { success: true, data: candidates }
    } catch (error) {
        console.error(error)
        return { success: false, error: "予約可能な時間枠の取得に失敗しました。" }
    }
}

export async function getBookableDaysInRange(startStr: string, endStr: string, menuId: string) {
    try {
        const menu = await prisma.menu.findUnique({
            where: { id: menuId },
            select: {
                id: true,
                name: true,
                durationMin: true,
                price: true,
                description: true,
            },
        })
        if (!menu) return { success: false, error: "メニューが見つかりません。" }

        const start = new Date(startStr)
        const end = new Date(endStr)
        const lessonType = toLessonTypeFromMenu(menu as { name?: string | null; category?: unknown })

        const slots = await prisma.openSlot.findMany({
            where: {
                isBooked: false,
                isPublic: true,
                startTime: { gte: start, lt: end },
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

        const supportShifts = await getSupportShiftsInRangeSafe(start, end)
        const filtered = slots.filter((slot) => {
            if (slot.roomId !== "B") return true
            if (!requiresSupportForRoomB(lessonType)) return true
            return hasSupportOverlap(supportShifts, slot.startTime, slot.endTime)
        })

        const dates = new Set(
            buildBookableStartTimes(filtered, menu.durationMin).map((slot) =>
                slot.startTime.toISOString().slice(0, 10)
            )
        )
        return { success: true, data: Array.from(dates) }
    } catch (error) {
        console.error(error)
        return { success: false, error: "予約可能日の取得に失敗しました。" }
    }
}

export async function getBookableSlotsInRange(startStr: string, endStr: string, menuId: string) {
    try {
        const menu = await prisma.menu.findUnique({
            where: { id: menuId },
            select: {
                id: true,
                name: true,
                durationMin: true,
                price: true,
                description: true,
            },
        })
        if (!menu) return { success: false, error: "メニューが見つかりません。" }

        const start = new Date(startStr)
        const end = new Date(endStr)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return { success: false, error: "日付指定が不正です。" }
        }

        const lessonType = toLessonTypeFromMenu(menu as { name?: string | null; category?: unknown })

        const slots = await prisma.openSlot.findMany({
            where: {
                isBooked: false,
                isPublic: true,
                startTime: { gte: start, lt: end },
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

        const supportShifts = await getSupportShiftsInRangeSafe(start, end)
        const filtered = slots.filter((slot) => {
            if (slot.roomId !== "B") return true
            if (!requiresSupportForRoomB(lessonType)) return true
            return hasSupportOverlap(supportShifts, slot.startTime, slot.endTime)
        })

        const candidates = buildBookableStartTimes(filtered, menu.durationMin)
        return { success: true, data: candidates }
    } catch (error) {
        console.error(error)
        return { success: false, error: "予約可能枠の取得に失敗しました。" }
    }
}

export async function getReschedulePolicy(lessonId: string) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    try {
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: {
                id: true,
                studentId: true,
                startTime: true,
                menuId: true,
                status: true,
            },
        })

        if (!lesson || lesson.studentId !== session.user.id) {
            return { success: false, error: "対象レッスンが見つかりません。" }
        }

        if (lesson.status === "CANCELLED") {
            return { success: false, error: "キャンセル済みレッスンは振替できません。" }
        }

        const lessonStart = new Date(lesson.startTime)
        const deadline = new Date(
            lessonStart.getTime() - BOOKING_RULES.CANCELLATION_HOURS_BEFORE * 60 * 60 * 1000
        )
        const windowStart = addDays(lessonStart, -BOOKING_RULES.RESCHEDULE_WINDOW_DAYS)
        const windowEnd = addDays(lessonStart, BOOKING_RULES.RESCHEDULE_WINDOW_DAYS)
        const now = new Date()

        const { start: monthStart, end: monthEnd } = getMonthRange(now)
        const usedThisMonth = await prisma.cancellationCredit.findUnique({
            where: {
                studentId_year_month: {
                    studentId: session.user.id,
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                },
            },
            select: { used: true },
        })

        const monthlyUsed = usedThisMonth?.used ?? 0
        const monthlyRemaining = Math.max(BOOKING_RULES.MAX_RESCHEDULES_PER_MONTH - monthlyUsed, 0)

        let reason: string | null = null
        if (now > deadline) {
            reason = `レッスン開始${BOOKING_RULES.CANCELLATION_HOURS_BEFORE / 24}日前を過ぎているため、振替できません。`
        } else if (monthlyRemaining <= 0) {
            reason = `今月の振替回数は上限（${BOOKING_RULES.MAX_RESCHEDULES_PER_MONTH}回）です。`
        }

        return {
            success: true,
            data: {
                lessonId: lesson.id,
                lessonStart: lesson.startTime.toISOString(),
                menuId: lesson.menuId,
                deadline: deadline.toISOString(),
                windowStart: windowStart.toISOString(),
                windowEnd: windowEnd.toISOString(),
                monthStart: monthStart.toISOString(),
                monthEnd: monthEnd.toISOString(),
                monthlyUsed,
                monthlyRemaining,
                canReschedule: reason === null,
                reason,
            },
        }
    } catch (error) {
        console.error(error)
        return { success: false, error: "振替条件の取得に失敗しました。" }
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

            if (slots.length !== slotIds.length) {
                throw new Error("選択された枠が見つかりません。もう一度選び直してください。")
            }

            if (slots.some((s) => s.isBooked || !s.isPublic)) {
                throw new Error("選択された枠は予約できません。")
            }

            const slotInfo = ensureContiguousSlots(slots)

            await assertNoReservationConflict(tx, {
                startTime: slotInfo.startTime,
                endTime: slotInfo.endTime,
                roomId: slotInfo.roomId,
                studentId: session.user.id!,
            })

            // 2. Mark slots as booked (atomic guard for race conditions)
            const updatedSlots = await tx.openSlot.updateMany({
                where: { id: { in: slotIds }, isBooked: false },
                data: { isBooked: true },
            })
            if (updatedSlots.count !== slotIds.length) {
                throw new Error("直前に他の予約が入りました。別の枠を選択してください。")
            }

            // 3. Look up menu to determine lesson type
            const menu = await tx.menu.findUnique({
                where: { id: menuId },
                select: {
                    id: true,
                    name: true,
                    durationMin: true,
                    price: true,
                    description: true,
                },
            })
            const lessonType = menu
                ? toLessonTypeFromMenu(menu as { name?: string | null; category?: unknown })
                : "REGULAR"

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

                if (credit.used >= BOOKING_RULES.MAX_RESCHEDULES_PER_MONTH) {
                    throw new Error(`今月の振替回数は上限（${BOOKING_RULES.MAX_RESCHEDULES_PER_MONTH}回）です。`)
                }

                await tx.cancellationCredit.update({
                    where: { id: credit.id },
                    data: { used: { increment: 1 } }
                })
            }

            // 5. Look up teacher (first TEACHER user)
            const teacher = await tx.user.findFirst({ where: { role: "TEACHER" } })

            // 5. Create Lesson
            await tx.lesson.create({
                data: {
                    studentId: session.user.id!,
                    teacherId: teacher?.id ?? null,
                    startTime: slotInfo.startTime,
                    endTime: slotInfo.endTime,
                    status: "BOOKED",
                    type: lessonType,
                    menuId,
                    roomId: slotInfo.roomId,
                },
            })

            revalidatePath("/student")
            revalidatePath("/student/book")
            revalidatePath("/teacher/schedule")
            revalidatePath("/teacher/resources")
            revalidatePath("/teacher/resources")

            // Send Notification (Fire and forget)
            void notifyEvent("BOOKING_COMPLETED", {
                studentId: session.user.id,
                startTime: slotInfo.startTime,
                endTime: slotInfo.endTime,
                roomId: slotInfo.roomId,
                menuId,
            })

            return { success: true }
        }, { isolationLevel: "Serializable" })
    } catch (error) {
        console.error(error)
        return { success: false, error: error instanceof Error ? error.message : "予約に失敗しました。" }
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

            // 3. Monthly limit validation
            const now = new Date()
            const year = now.getFullYear()
            const month = now.getMonth() + 1

            const credit = await tx.cancellationCredit.findUnique({
                where: {
                    studentId_year_month: {
                        studentId: session.user.id!,
                        year,
                        month
                    }
                }
            })

            const usedThisMonth = credit?.used ?? 0
            if (usedThisMonth >= BOOKING_RULES.MAX_RESCHEDULES_PER_MONTH) {
                throw new Error(`今月の振替回数は上限（${BOOKING_RULES.MAX_RESCHEDULES_PER_MONTH}回）です。`)
            }

            // 4. Verify new slots
            const newSlots = await tx.openSlot.findMany({
                where: { id: { in: slotIds } },
            })
            if (newSlots.length !== slotIds.length) {
                throw new Error("選択された枠が見つかりません。")
            }

            if (newSlots.some((s) => s.isBooked || !s.isPublic)) {
                throw new Error("選択された枠は予約できません。")
            }

            const slotInfo = ensureContiguousSlots(newSlots)
            const newStart = slotInfo.startTime
            const newEnd = slotInfo.endTime

            const windowStart = addDays(lessonStart, -BOOKING_RULES.RESCHEDULE_WINDOW_DAYS)
            const windowEnd = addDays(lessonStart, BOOKING_RULES.RESCHEDULE_WINDOW_DAYS)
            if (newStart < windowStart || newStart > windowEnd) {
                throw new Error(
                    `振替可能なのは元のレッスン日の前後${BOOKING_RULES.RESCHEDULE_WINDOW_DAYS}日以内です。`
                )
            }

            await assertNoReservationConflict(tx, {
                startTime: newStart,
                endTime: newEnd,
                roomId: slotInfo.roomId,
                studentId: session.user.id!,
                ignoreLessonId: lesson.id,
            })

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
                    used: { increment: 1 }
                },
                create: {
                    studentId: session.user.id!,
                    year,
                    month,
                    count: 0,
                    used: 1
                }
            })

            // 6. Update Lesson
            await tx.lesson.update({
                where: { id: lessonId },
                data: {
                    startTime: newStart,
                    endTime: newEnd,
                    roomId: slotInfo.roomId,
                    updatedAt: new Date(),
                }
            })

            // 7. Mark new slots booked
            const reserved = await tx.openSlot.updateMany({
                where: { id: { in: slotIds }, isBooked: false },
                data: { isBooked: true },
            })
            if (reserved.count !== slotIds.length) {
                throw new Error("直前に他の予約が入りました。別の時間を選択してください。")
            }

            // 8. Free old slots
            if (lesson.roomId) {
                await tx.openSlot.updateMany({
                    where: {
                        startTime: lesson.startTime,
                        endTime: lesson.endTime,
                        roomId: lesson.roomId,
                        isBooked: true
                    },
                    data: { isBooked: false }
                })
            }

            revalidatePath("/student")
            revalidatePath("/student/book")
            revalidatePath("/teacher/schedule")
            revalidatePath("/teacher/resources")

            void notifyEvent("RESCHEDULE_COMPLETED", {
                studentId: session.user.id,
                oldStartTime: lesson.startTime,
                newStartTime: newStart,
                newEndTime: newEnd,
                roomId: slotInfo.roomId,
                lessonId
            })

            return { success: true }
        }, { isolationLevel: "Serializable" })
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
            if (lesson.roomId) {
                await tx.openSlot.updateMany({
                    where: {
                        startTime: lesson.startTime,
                        endTime: lesson.endTime,
                        roomId: lesson.roomId,
                        isBooked: true,
                    },
                    data: { isBooked: false },
                })
            }

            revalidatePath("/student")
            revalidatePath("/student/book")
            revalidatePath("/teacher/schedule")

            void notifyEvent("LESSON_CANCELLED", {
                studentId: lesson.studentId,
                startTime: lesson.startTime,
                eligibleForCredit: isEligibleForCredit,
                lessonId,
                cancelledByRole: session.user.role,
            })

            return { success: true }
        })
    } catch (error) {
        console.error(error)
        return { success: false, error: error instanceof Error ? error.message : "キャンセルに失敗しました" }
    }
}
