'use server'

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addDays, startOfMonth, endOfMonth, getDay, setHours, setMinutes } from "date-fns"
import { notifyEvent } from "@/lib/notifications"
import { getSupportShiftsInRangeSafe, hasSupportShiftInRange } from "@/lib/support-shifts"
import { getClosedDaysInRangeSafe, isSlotClosed } from "@/lib/closed-days"

function getMonthBounds(year: number, month: number) {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const end = new Date(year, month, 1, 0, 0, 0, 0) // exclusive
    return { start, end }
}

export async function getPlanningData() {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        throw new Error("Unauthorized")
    }

    const students = await prisma.user.findMany({
        where: { role: "STUDENT" },
        include: {
            availabilities: {
                orderBy: { createdAt: "desc" },
                take: 1
            }
        }
    })

    return { success: true, students }
}

export async function getMonthlyPlanningData(year: number, month: number) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        throw new Error("Unauthorized")
    }

    const { start, end } = getMonthBounds(year, month)

    const [students, lessons, supportShifts, publicationRows] = await Promise.all([
        prisma.user.findMany({
            where: { role: "STUDENT" },
            include: {
                monthlyAvailabilities: {
                    where: { year, month },
                    take: 1
                }
            },
            orderBy: { name: 'asc' }
        }),
        prisma.lesson.findMany({
            where: {
                startTime: { gte: start, lt: end },
                status: { not: "CANCELLED" }
            },
            orderBy: { startTime: "asc" },
        }),
        getSupportShiftsInRangeSafe(start, end),
        prisma.$queryRaw<Array<{ id: string; publishedAt: Date }>>`
            SELECT "id", "publishedAt"
            FROM "MonthlySchedulePublication"
            WHERE "year" = ${year} AND "month" = ${month}
            LIMIT 1
        `.catch(() => []),
    ])
    const publication = publicationRows[0] ?? null

    return {
        success: true,
        data: {
            students: students.map(s => ({
                ...s,
                availability: s.monthlyAvailabilities[0] || null,
                defaultLessonCount: s.defaultLessonCount
            })),
            lessons,
            supportShifts,
            isPublished: !!publication,
            publishedAt: publication?.publishedAt ?? null,
        }
    }
}

type Assignment = {
    dayOfWeek: number // 0-6 (Sun-Sat)
    hour: number
    minute: number
    studentId: string
    duration: number
    roomId: string
}

export async function publishFixedSchedule(monthStr: string, assignments: Assignment[]) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        throw new Error("Unauthorized")
    }

    const targetDate = new Date(monthStr + "-01") // "2026-03" -> Date
    const start = startOfMonth(targetDate)
    const end = endOfMonth(targetDate)

    try {
        await prisma.$transaction(async (tx) => {
            // Iterate through each day of the month
            let current = start
            while (current <= end) {
                const dayOfWeek = getDay(current)

                // Find assignments for this day of week
                const daysAssignments = assignments.filter(a => a.dayOfWeek === dayOfWeek)

                for (const assignment of daysAssignments) {
                    const lessonStart = setMinutes(setHours(current, assignment.hour), assignment.minute)
                    const lessonEnd = setMinutes(setHours(current, assignment.hour), assignment.minute + assignment.duration)

                    // Check for conflicts? For now, trust the teacher's "Puzzle"

                    // Create Lesson
                    await tx.lesson.create({
                        data: {
                            startTime: lessonStart,
                            endTime: lessonEnd,
                            studentId: assignment.studentId,
                            teacherId: session.user.id!,
                            type: "REGULAR",
                            status: "BOOKED",
                            roomId: assignment.roomId,
                        }
                    })
                }

                current = addDays(current, 1)
            }
        })

        revalidatePath("/teacher")
        return { success: true }
    } catch (error) {
        console.error("Failed to publish schedule:", error)
        return { success: false, error: "Failed to publish schedule" }
    }
}

export type LessonDraft = {
    studentId: string
    startTime: string | Date
    endTime: string | Date
    roomId: string
    menuId?: string
    price?: number
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
    status?: "BOOKED" | "DRAFT"
}

export async function publishMonthlySchedule(year: number, month: number) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false as const, error: "Unauthorized" }
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return { success: false as const, error: "Invalid month range" }
    }

    try {
        const { start, end } = getMonthBounds(year, month)
        const now = new Date()
        const publicationId = `pub_${year}_${month}_${Date.now()}`

        const inserted = await prisma.$transaction(async (tx) => {
            const insertedCount = await tx.$executeRaw`
                INSERT INTO "MonthlySchedulePublication"
                    ("id", "year", "month", "publishedAt", "publishedBy", "createdAt", "updatedAt")
                VALUES
                    (${publicationId}, ${year}, ${month}, ${now}, ${session.user.id ?? null}, ${now}, ${now})
                ON CONFLICT ("year", "month") DO NOTHING
            `

            await tx.lesson.updateMany({
                where: {
                    startTime: { gte: start, lt: end },
                    status: "DRAFT",
                },
                data: {
                    status: "BOOKED",
                },
            })

            return Number(insertedCount)
        })

        revalidatePath("/teacher/schedule/monthly")
        revalidatePath("/teacher/schedule")
        revalidatePath("/student")
        if (inserted > 0) {
            void notifyEvent("MONTHLY_SCHEDULE_FINALIZED", {
                year,
                month,
                publishedBy: session.user.id ?? null,
                publishedAt: now.toISOString(),
            })
        }
        return { success: true as const, alreadyPublished: inserted === 0 }
    } catch (error) {
        console.error("Failed to publish monthly schedule:", error)
        return { success: false as const, error: "Failed to publish monthly schedule" }
    }
}

export async function bulkCreateLessons(lessons: LessonDraft[]) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false, error: "Unauthorized" }
    }

    if (lessons.length === 0) {
        return { success: true }
    }

    try {
        const parsedRanges = lessons
            .map((lesson) => ({
                startTime: new Date(lesson.startTime),
                endTime: new Date(lesson.endTime),
            }))
            .filter((lesson) => !Number.isNaN(lesson.startTime.getTime()) && !Number.isNaN(lesson.endTime.getTime()))
        const closedDays = parsedRanges.length > 0
            ? await getClosedDaysInRangeSafe(
                parsedRanges.reduce((acc, row) => (row.startTime < acc ? row.startTime : acc), parsedRanges[0].startTime),
                parsedRanges.reduce((acc, row) => (row.endTime > acc ? row.endTime : acc), parsedRanges[0].endTime),
                { scope: "teacher" }
            )
            : []

        await prisma.$transaction(async (tx) => {
            for (const lesson of lessons) {
                const startTime = new Date(lesson.startTime)
                const endTime = new Date(lesson.endTime)
                const roomId = lesson.roomId || "A"

                if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
                    throw new Error("レッスン日時が不正です。")
                }
                if (isSlotClosed(closedDays, startTime, endTime)) {
                    throw new Error("お休み時間帯にレッスンを作成できません。")
                }

                const [roomConflict, studentConflict] = await Promise.all([
                    tx.lesson.findFirst({
                        where: {
                            status: { not: "CANCELLED" },
                            startTime: { lt: endTime },
                            endTime: { gt: startTime },
                            ...(roomId === "A"
                                ? { OR: [{ roomId: "A" }, { roomId: null }] }
                                : { roomId }),
                        },
                        select: { id: true },
                    }),
                    tx.lesson.findFirst({
                        where: {
                            status: { not: "CANCELLED" },
                            studentId: lesson.studentId,
                            startTime: { lt: endTime },
                            endTime: { gt: startTime },
                        },
                        select: { id: true },
                    }),
                ])

                if (roomConflict) {
                    throw new Error(`同時間帯にRoom ${roomId} のレッスンが存在します。`)
                }

                if (studentConflict) {
                    throw new Error("同じ生徒のレッスン時間が重複しています。")
                }

                const nextType = lesson.type ?? "REGULAR"
                if (roomId === "B" && nextType !== "PRACTICE") {
                    const hasSupport = await hasSupportShiftInRange(startTime, endTime)
                    if (!hasSupport) {
                        throw new Error("第2レッスン室でレッスンを作成するにはサポート講師の在席シフトが必要です。")
                    }
                }

                await tx.lesson.create({
                    data: {
                        studentId: lesson.studentId,
                        teacherId: session.user.id!,
                        startTime,
                        endTime,
                        roomId,
                        menuId: lesson.menuId,
                        type: nextType,
                        status: lesson.status ?? "DRAFT",
                    }
                })
            }
        })

        revalidatePath("/teacher")
        revalidatePath("/teacher/schedule")
        revalidatePath("/teacher/schedule/monthly")
        return { success: true }
    } catch (error) {
        console.error("Failed to bulk create lessons:", error)
        if (error instanceof Error) {
            return { success: false, error: error.message }
        }
        return { success: false, error: "Failed to create lessons" }
    }
}

type ReplaceMonthlyLessonsInput = {
    studentId: string
    year: number
    month: number
    lessons: Array<{
        startTime: string | Date
        endTime: string | Date
        roomId?: string
        type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
    }>
}

export async function replaceStudentMonthlyLessons(input: ReplaceMonthlyLessonsInput) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false as const, error: "Unauthorized" }
    }

    const { start: monthStart, end: monthEnd } = getMonthBounds(input.year, input.month)
    const closedDays = await getClosedDaysInRangeSafe(monthStart, monthEnd, { scope: "teacher" })

    const normalizedLessons = input.lessons
        .map((lesson) => ({
            startTime: new Date(lesson.startTime),
            endTime: new Date(lesson.endTime),
            roomId: lesson.roomId || "A",
            type: lesson.type || "REGULAR",
        }))
        .filter((lesson) =>
            !Number.isNaN(lesson.startTime.getTime()) &&
            !Number.isNaN(lesson.endTime.getTime())
        )
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    for (const lesson of normalizedLessons) {
        if (lesson.endTime <= lesson.startTime) {
            return { success: false as const, error: "開始時刻は終了時刻より前にしてください。" }
        }
        if (lesson.startTime < monthStart || lesson.startTime >= monthEnd) {
            return { success: false as const, error: "対象月以外の日時は保存できません。" }
        }
        if (isSlotClosed(closedDays, lesson.startTime, lesson.endTime)) {
            return { success: false as const, error: "お休み時間帯のため保存できません。" }
        }
    }
    for (let i = 1; i < normalizedLessons.length; i++) {
        const prev = normalizedLessons[i - 1]
        const current = normalizedLessons[i]
        if (prev.startTime < current.endTime && prev.endTime > current.startTime) {
            return { success: false as const, error: "同じ生徒の予定が重複しています。" }
        }
    }

    try {
        const publicationRows = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "MonthlySchedulePublication"
            WHERE "year" = ${input.year} AND "month" = ${input.month}
            LIMIT 1
        `.catch(() => [])
        const isMonthPublished = publicationRows.length > 0

        const savedCount = await prisma.$transaction(async (tx) => {
            const existing = await tx.lesson.findMany({
                where: {
                    studentId: input.studentId,
                    status: { in: ["DRAFT", "BOOKED"] },
                    startTime: { gte: monthStart, lt: monthEnd },
                },
                select: {
                    id: true,
                    status: true,
                    startTime: true,
                    endTime: true,
                    roomId: true,
                    type: true,
                },
            })

            const existingIds = existing.map((lesson) => lesson.id)
            const existingByKey = new Map(
                existing.map((lesson) => [
                    `${lesson.startTime.toISOString()}__${lesson.endTime.toISOString()}__${lesson.roomId || "A"}__${lesson.type}`,
                    lesson,
                ])
            )
            const normalizedByKey = new Map(
                normalizedLessons.map((lesson) => [
                    `${lesson.startTime.toISOString()}__${lesson.endTime.toISOString()}__${lesson.roomId || "A"}__${lesson.type}`,
                    lesson,
                ])
            )

            for (const lesson of normalizedLessons) {
                const [roomConflict, studentConflict] = await Promise.all([
                    tx.lesson.findFirst({
                        where: {
                            id: existingIds.length > 0 ? { notIn: existingIds } : undefined,
                            status: { not: "CANCELLED" },
                            ...(lesson.roomId === "A"
                                ? { OR: [{ roomId: "A" }, { roomId: null }] }
                                : { roomId: lesson.roomId }),
                            startTime: { lt: lesson.endTime },
                            endTime: { gt: lesson.startTime },
                        },
                        select: { id: true },
                    }),
                    tx.lesson.findFirst({
                        where: {
                            id: existingIds.length > 0 ? { notIn: existingIds } : undefined,
                            status: { not: "CANCELLED" },
                            studentId: input.studentId,
                            startTime: { lt: lesson.endTime },
                            endTime: { gt: lesson.startTime },
                        },
                        select: { id: true },
                    }),
                ])

                if (roomConflict) {
                    throw new Error(`同時間帯にRoom ${lesson.roomId} の予定があるため保存できません。`)
                }
                if (studentConflict) {
                    throw new Error("同じ生徒の予定が重複しています。")
                }

                if (lesson.roomId === "B" && lesson.type !== "PRACTICE") {
                    const hasSupport = await hasSupportShiftInRange(lesson.startTime, lesson.endTime)
                    if (!hasSupport) {
                        throw new Error("第2レッスン室で通常レッスンを保存するにはサポート講師の在席シフトが必要です。")
                    }
                }
            }

            const idsToDelete = existing
                .filter((lesson) =>
                    !normalizedByKey.has(`${lesson.startTime.toISOString()}__${lesson.endTime.toISOString()}__${lesson.roomId || "A"}__${lesson.type}`)
                )
                .map((lesson) => lesson.id)

            if (idsToDelete.length > 0) {
                await tx.lesson.deleteMany({
                    where: { id: { in: idsToDelete } },
                })
            }

            const toCreate = normalizedLessons.filter(
                (lesson) =>
                    !existingByKey.has(`${lesson.startTime.toISOString()}__${lesson.endTime.toISOString()}__${lesson.roomId || "A"}__${lesson.type}`)
            )

            if (toCreate.length > 0) {
                await tx.lesson.createMany({
                    data: toCreate.map((lesson) => ({
                        studentId: input.studentId,
                        teacherId: session.user.id!,
                        startTime: lesson.startTime,
                        endTime: lesson.endTime,
                        roomId: lesson.roomId,
                        type: lesson.type,
                        status: isMonthPublished ? "BOOKED" : "DRAFT",
                    })),
                })
            }

            return normalizedLessons.length
        })

        revalidatePath("/teacher/schedule")
        revalidatePath("/teacher/schedule/monthly")

        return { success: true as const, count: savedCount }
    } catch (error) {
        console.error("Failed to replace monthly lessons:", error)
        if (error instanceof Error) {
            return { success: false as const, error: error.message }
        }
        return { success: false as const, error: "月間スケジュールの保存に失敗しました。" }
    }
}

export async function appendStudentMonthlyLesson(input: {
    studentId: string
    startTime: string | Date
    endTime: string | Date
    roomId?: string
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
    status?: "DRAFT" | "BOOKED"
}) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false as const, error: "Unauthorized" }
    }

    try {
        const startTime = new Date(input.startTime)
        const endTime = new Date(input.endTime)
        const roomId = input.roomId || "A"
        const type = input.type || "REGULAR"
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
            return { success: false as const, error: "日時が不正です。" }
        }
        const closedDays = await getClosedDaysInRangeSafe(startTime, endTime, { scope: "teacher" })
        if (isSlotClosed(closedDays, startTime, endTime)) {
            return { success: false as const, error: "お休み時間帯のため設定できません。" }
        }

        const [roomConflict, studentConflict] = await Promise.all([
            prisma.lesson.findFirst({
                where: {
                    status: { not: "CANCELLED" },
                    ...(roomId === "A"
                        ? { OR: [{ roomId: "A" }, { roomId: null }] }
                        : { roomId }),
                    startTime: { lt: endTime },
                    endTime: { gt: startTime },
                },
                select: { id: true },
            }),
            prisma.lesson.findFirst({
                where: {
                    status: { not: "CANCELLED" },
                    studentId: input.studentId,
                    startTime: { lt: endTime },
                    endTime: { gt: startTime },
                },
                select: { id: true },
            }),
        ])
        if (roomConflict) {
            return { success: false as const, error: `同時間帯にRoom ${roomId} の予定があります。` }
        }
        if (studentConflict) {
            return { success: false as const, error: "同じ生徒の予定が重複しています。" }
        }

        if (roomId === "B" && type !== "PRACTICE") {
            const hasSupport = await hasSupportShiftInRange(startTime, endTime)
            if (!hasSupport) {
                return { success: false as const, error: "第2レッスン室で通常レッスンを設定するにはサポート講師シフトが必要です。" }
            }
        }

        await prisma.lesson.create({
            data: {
                studentId: input.studentId,
                teacherId: session.user.id!,
                startTime,
                endTime,
                roomId,
                type,
                status: input.status || "DRAFT",
            },
        })

        revalidatePath("/teacher/schedule/monthly")
        revalidatePath("/teacher/schedule")
        revalidatePath("/student")
        return { success: true as const }
    } catch (error) {
        console.error("appendStudentMonthlyLesson error", error)
        return { success: false as const, error: "手動追加に失敗しました。" }
    }
}
