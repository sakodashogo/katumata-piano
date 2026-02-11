"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const ReportSchema = z.object({
    lessonId: z.string(),
    report: z.string().optional(),
    homework: z.string().optional(),
    rating: z.string().transform(v => parseInt(v)).pipe(z.number().min(1).max(5)).optional(),
})

export async function updateLessonReport(formData: FormData) {
    const session = await auth()
    if (session?.user?.role !== "TEACHER") return { success: false, error: "Unauthorized" }

    const rawData = {
        lessonId: formData.get("lessonId"),
        report: formData.get("report"),
        homework: formData.get("homework"),
        rating: formData.get("rating"),
    }

    const validatedFields = ReportSchema.safeParse(rawData)
    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" }
    }

    const { lessonId, report, homework, rating } = validatedFields.data

    try {
        await prisma.lesson.update({
            where: { id: lessonId },
            data: {
                report,
                homework,
                rating,
            }
        })
        revalidatePath(`/teacher/students`) // Ideally revalidate specific student page
        return { success: true }
    } catch (error) {
        return { success: false, error: "Failed to update report" }
    }
}

export async function getStudentHistory(studentId: string) {
    try {
        const lessons = await prisma.lesson.findMany({
            where: {
                studentId,
                status: { not: "CANCELLED" },
                startTime: { lte: new Date() } // Past (or current) lessons
            },
            orderBy: { startTime: "desc" }
        })
        return { success: true, data: lessons }
    } catch (error) {
        return { success: false, error: "Failed to fetch history" }
    }
}
