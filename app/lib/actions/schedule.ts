"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addMinutes } from "date-fns"
import { getSupportShiftsInRangeSafe, hasSupportShiftInRange } from "@/lib/support-shifts"

function revalidateTeacherViews() {
    revalidatePath("/teacher/schedule")
    revalidatePath("/teacher/slots")
    revalidatePath("/teacher/resources")
}

async function requireTeacher() {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return null
    }
    return session
}

function lessonRoomWhereClause(roomId: string) {
    if (roomId === "A") {
        return { OR: [{ roomId: "A" as const }, { roomId: null }] }
    }
    return { roomId }
}

async function hasRoomScheduleConflict(options: {
    roomId: string
    startTime: Date
    endTime: Date
    excludeSlotId?: string
    excludeLessonId?: string
}) {
    const [slotConflict, lessonConflict] = await Promise.all([
        prisma.openSlot.findFirst({
            where: {
                id: options.excludeSlotId ? { not: options.excludeSlotId } : undefined,
                roomId: options.roomId,
                startTime: { lt: options.endTime },
                endTime: { gt: options.startTime },
            },
            select: { id: true },
        }),
        prisma.lesson.findFirst({
            where: {
                id: options.excludeLessonId ? { not: options.excludeLessonId } : undefined,
                status: { not: "CANCELLED" },
                ...lessonRoomWhereClause(options.roomId),
                startTime: { lt: options.endTime },
                endTime: { gt: options.startTime },
            },
            select: { id: true },
        }),
    ])

    return !!slotConflict || !!lessonConflict
}

async function hasLessonConflict(options: {
    roomId: string
    startTime: Date
    endTime: Date
    excludeLessonId?: string
}) {
    const lessonConflict = await prisma.lesson.findFirst({
        where: {
            id: options.excludeLessonId ? { not: options.excludeLessonId } : undefined,
            status: { not: "CANCELLED" },
            ...lessonRoomWhereClause(options.roomId),
            startTime: { lt: options.endTime },
            endTime: { gt: options.startTime },
        },
        select: { id: true },
    })

    return !!lessonConflict
}

export async function getScheduleData(roomId: string | undefined, start: Date, end: Date) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const whereClause = {
            startTime: { gte: start, lt: end },
            ...(roomId ? { roomId } : {})
        }

        const [slots, lessons, supportShifts] = await Promise.all([
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
            }),
            getSupportShiftsInRangeSafe(start, end),
        ])
        return { success: true, data: { slots, lessons, supportShifts } }
    } catch (error) {
        console.error("Failed to fetch schedule data:", error)
        return { success: false, error: "Failed to fetch schedule data" }
    }
}

export async function toggleOpenSlot(roomId: string, startTimeIso: string) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

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
            const hasConflict = await hasRoomScheduleConflict({
                roomId,
                startTime,
                endTime,
            })
            if (hasConflict) {
                return { success: false, error: "同じ教室・時間帯に既存の予定があるため追加できません。" }
            }

            // Create
            await prisma.openSlot.create({
                data: {
                    roomId,
                    startTime,
                    endTime,
                },
            })
        }

        revalidateTeacherViews()
        return { success: true }
    } catch (error) {
        console.error("Failed to toggle slot:", error)
        return { success: false, error: "Failed to update slot" }
    }
}

export async function bulkUpdateOpenSlots(roomId: string, slots: string[], action: 'add' | 'remove') {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        if (action === 'add') {
            const candidateStarts = Array.from(
                new Set(slots.map((value) => new Date(value).toISOString()))
            )
                .map((value) => new Date(value))
                .sort((a, b) => a.getTime() - b.getTime())
            if (candidateStarts.length === 0) {
                revalidateTeacherViews()
                return { success: true }
            }

            const rangeStart = candidateStarts[0]
            const rangeEnd = addMinutes(candidateStarts[candidateStarts.length - 1], 30)

            const [existing, existingLessons] = await Promise.all([
                prisma.openSlot.findMany({
                    where: {
                        roomId,
                        startTime: { lt: rangeEnd },
                        endTime: { gt: rangeStart },
                    },
                    select: { startTime: true, endTime: true },
                }),
                prisma.lesson.findMany({
                    where: {
                        status: { not: "CANCELLED" },
                        roomId,
                        startTime: { lt: rangeEnd },
                        endTime: { gt: rangeStart },
                    },
                    select: { startTime: true, endTime: true },
                }),
            ])

            const hasOverlap = (start: Date, end: Date) =>
                existing.some((slot) => slot.startTime < end && slot.endTime > start) ||
                existingLessons.some((lesson) => lesson.startTime < end && lesson.endTime > start)

            const newSlots = candidateStarts
                .filter((start) => !hasOverlap(start, addMinutes(start, 30)))
                .map((start) => ({
                    roomId,
                    startTime: start,
                    endTime: addMinutes(start, 30),
                    isBooked: false
                }))

            if (newSlots.length > 0) {
                await prisma.openSlot.createMany({
                    data: newSlots
                })
            }
        } else {
            await prisma.openSlot.deleteMany({
                where: {
                    roomId,
                    startTime: { in: slots.map(d => new Date(d)) },
                    isBooked: false,
                },
            })
        }

        revalidateTeacherViews()
        return { success: true }
    } catch (error) {
        console.error("Failed to bulk update slots:", error)
        return { success: false, error: "Failed to bulk update slots" }
    }
}

export async function getMonthlyLessonCalendarData(year: number, month: number) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false as const, error: "Unauthorized" }
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return { success: false as const, error: "Invalid month range" }
    }

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const monthEnd = new Date(year, month, 1, 0, 0, 0, 0)

    try {
        const [lessons, supportShifts] = await Promise.all([
            prisma.lesson.findMany({
                where: {
                    startTime: { gte: monthStart, lt: monthEnd },
                    status: { not: "CANCELLED" },
                },
                include: {
                    student: { select: { name: true } },
                },
                orderBy: { startTime: "asc" },
            }),
            getSupportShiftsInRangeSafe(monthStart, monthEnd),
        ])

        return { success: true as const, data: { lessons, supportShifts } }
    } catch (error) {
        console.error("Failed to fetch monthly lesson calendar data:", error)
        return { success: false as const, error: "Failed to fetch monthly lesson calendar data" }
    }
}

export async function moveLesson(lessonId: string, newStartTime: Date, newRoomId: string) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } })
        if (!lesson) return { success: false, error: "Lesson not found" }

        const duration = lesson.endTime.getTime() - lesson.startTime.getTime()
        const newEndTime = new Date(newStartTime.getTime() + duration)

        if (newRoomId === "B" && lesson.type !== "PRACTICE") {
            const hasSupport = await hasSupportShiftInRange(newStartTime, newEndTime)
            if (!hasSupport) {
                return { success: false, error: "第2レッスン室でレッスンを行うにはサポート講師の在席シフトが必要です。" }
            }
        }

        const [roomConflict, studentConflict] = await Promise.all([
            hasLessonConflict({
                roomId: newRoomId,
                startTime: newStartTime,
                endTime: newEndTime,
                excludeLessonId: lesson.id,
            }),
            prisma.lesson.findFirst({
                where: {
                    id: { not: lesson.id },
                    status: { not: "CANCELLED" },
                    studentId: lesson.studentId,
                    startTime: { lt: newEndTime },
                    endTime: { gt: newStartTime },
                },
                select: { id: true },
            }),
        ])

        if (roomConflict) {
            return { success: false, error: "同じ教室・時間帯に別の予定があるため移動できません。" }
        }
        if (studentConflict) {
            return { success: false, error: "生徒の別レッスンと時間が重複するため移動できません。" }
        }

        await prisma.$transaction(async (tx) => {
            await tx.lesson.update({
                where: { id: lessonId },
                data: {
                    startTime: newStartTime,
                    endTime: newEndTime,
                    roomId: newRoomId,
                    status: "DRAFT"
                }
            })

            if (lesson.roomId) {
                await tx.openSlot.updateMany({
                    where: {
                        roomId: lesson.roomId,
                        startTime: { lt: lesson.endTime },
                        endTime: { gt: lesson.startTime },
                        isBooked: true,
                    },
                    data: { isBooked: false },
                })
            }

            await tx.openSlot.updateMany({
                where: {
                    roomId: newRoomId,
                    startTime: { lt: newEndTime },
                    endTime: { gt: newStartTime },
                    isBooked: false,
                },
                data: { isBooked: true },
            })
        })

        revalidateTeacherViews()
        return { success: true }
    } catch (error) {
        console.error("Failed to move lesson:", error)
        return { success: false, error: "Failed to move lesson" }
    }
}

export async function publishLessons(lessonIds: string[]) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        await prisma.lesson.updateMany({
            where: { id: { in: lessonIds } },
            data: { status: "BOOKED" } // Or whatever "Published" maps to. BOOKED is fine.
        })
        revalidateTeacherViews()
        return { success: true }
    } catch (error) {
        console.error("Failed to publish lessons:", error)
        return { success: false, error: "Failed to publish lessons" }
    }
}

export async function moveOpenSlot(slotId: string, newStartTime: Date, newRoomId: string) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const slot = await prisma.openSlot.findUnique({ where: { id: slotId } })
        if (!slot) return { success: false, error: "Slot not found" }
        if (slot.isBooked) return { success: false, error: "予約済みの枠は移動できません。" }

        const duration = slot.endTime.getTime() - slot.startTime.getTime()
        const newEndTime = new Date(newStartTime.getTime() + duration)

        const hasConflict = await hasRoomScheduleConflict({
            roomId: newRoomId,
            startTime: newStartTime,
            endTime: newEndTime,
            excludeSlotId: slot.id,
        })
        if (hasConflict) {
            return { success: false, error: "同じ教室・時間帯に別の予定があるため移動できません。" }
        }

        await prisma.openSlot.update({
            where: { id: slotId },
            data: {
                startTime: newStartTime,
                endTime: newEndTime,
                roomId: newRoomId
            }
        })
        revalidateTeacherViews()
        return { success: true }
    } catch (error) {
        console.error("Failed to move slot:", error)
        return { success: false, error: "Failed to move slot" }
    }
}
