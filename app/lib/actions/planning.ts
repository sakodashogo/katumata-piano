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
