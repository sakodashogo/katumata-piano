'use server'

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addDays, format, startOfMonth, endOfMonth, getDay, setHours, setMinutes } from "date-fns"

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

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59)

    const [students, lessons] = await Promise.all([
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
                startTime: { gte: start, lte: end },
                status: { not: "CANCELLED" }
            }
        })
    ])

    return {
        success: true,
        data: {
            students: students.map(s => ({
                ...s,
                availability: s.monthlyAvailabilities[0] || null,
                defaultLessonCount: s.defaultLessonCount
            })),
            lessons
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
    type?: "REGULAR" | "AD_HOC" | "PRACTICE"
}

export async function bulkCreateLessons(lessons: LessonDraft[]) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false, error: "Unauthorized" }
    }

    try {
        await prisma.$transaction(async (tx) => {
            for (const lesson of lessons) {
                await tx.lesson.create({
                    data: {
                        studentId: lesson.studentId,
                        teacherId: session.user.id!,
                        startTime: new Date(lesson.startTime),
                        endTime: new Date(lesson.endTime),
                        roomId: lesson.roomId,
                        menuId: lesson.menuId,
                        type: lesson.type ?? "REGULAR",
                        status: "BOOKED", // or confirmed?
                    }
                })
            }
        })

        revalidatePath("/teacher")
        revalidatePath("/teacher/schedule")
        return { success: true }
    } catch (error) {
        console.error("Failed to bulk create lessons:", error)
        return { success: false, error: "Failed to create lessons" }
    }
}
