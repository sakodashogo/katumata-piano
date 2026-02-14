"use server"

import { auth } from "@/auth"
import { Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import { revalidatePath, revalidateTag } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
    STUDENTS_CACHE_TAG,
    TEACHER_AVAILABILITIES_PAGE_CACHE_TAG,
} from "@/lib/cache-tags"

const StudentSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z.string().email("Invalid email address")
    ),
    defaultLessonCount: z.coerce.number().min(1).default(4),
})

function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

async function requireTeacher() {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return null
    }
    return session
}

function revalidateStudentPages(studentId?: string) {
    revalidatePath("/teacher/students")
    if (studentId) {
        revalidatePath(`/teacher/students/${studentId}`)
    }
    revalidateTag(STUDENTS_CACHE_TAG, "max")
    revalidateTag(TEACHER_AVAILABILITIES_PAGE_CACHE_TAG, "max")
}

export async function getStudents(isArchived = false) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" as const }
    }

    try {
        const students = await prisma.user.findMany({
            where: {
                role: "STUDENT",
                isArchived,
            },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                defaultLessonCount: true,
                isArchived: true,
            },
            orderBy: { createdAt: "desc" },
        })
        return { success: true, data: students }
    } catch (error) {
        console.error("Failed to fetch students:", error)
        return { success: false, error: "Failed to fetch students" as const }
    }
}

export async function createStudent(formData: FormData) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" as const }
    }

    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
        defaultLessonCount: formData.get("defaultLessonCount"),
    }

    const validatedFields = StudentSchema.safeParse(rawData)
    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" as const }
    }

    const { name } = validatedFields.data
    const email = normalizeEmail(validatedFields.data.email)
    const hashedPassword = await bcrypt.hash("piano123", 10)

    try {
        await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: "STUDENT",
                defaultLessonCount: validatedFields.data.defaultLessonCount,
            },
        })
        revalidateStudentPages()
        return { success: true as const }
    } catch (error) {
        console.error("Failed to create student:", error)
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return {
                success: false,
                error: "このメールアドレスはすでに使用されています。" as const,
            }
        }
        return { success: false, error: "生徒の作成に失敗しました。" as const }
    }
}

export async function updateStudent(id: string, formData: FormData) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" as const }
    }

    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
        defaultLessonCount: formData.get("defaultLessonCount"),
    }

    const validatedFields = StudentSchema.safeParse(rawData)
    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" as const }
    }

    try {
        await prisma.user.update({
            where: { id },
            data: {
                name: validatedFields.data.name,
                email: normalizeEmail(validatedFields.data.email),
                defaultLessonCount: validatedFields.data.defaultLessonCount,
            },
        })
        revalidateStudentPages(id)
        return { success: true as const }
    } catch (error) {
        console.error("Failed to update student:", error)
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return {
                success: false,
                error: "このメールアドレスはすでに使用されています。" as const,
            }
        }
        return { success: false, error: "生徒情報の更新に失敗しました。" as const }
    }
}

export async function archiveStudent(id: string) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" as const }
    }

    try {
        await prisma.user.update({
            where: { id },
            data: { isArchived: true },
        })
        revalidateStudentPages(id)
        return { success: true as const }
    } catch (error) {
        console.error("Failed to archive student:", error)
        return { success: false, error: "アーカイブに失敗しました。" as const }
    }
}

export async function unarchiveStudent(id: string) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" as const }
    }

    try {
        await prisma.user.update({
            where: { id },
            data: { isArchived: false },
        })
        revalidateStudentPages(id)
        return { success: true as const }
    } catch (error) {
        console.error("Failed to unarchive student:", error)
        return { success: false, error: "復元に失敗しました。" as const }
    }
}

export async function deleteStudent(id: string) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" as const }
    }

    try {
        const [lessonCount, availabilityCount, monthlyAvailabilityCount, creditCount] =
            await Promise.all([
                prisma.lesson.count({ where: { studentId: id } }),
                prisma.availability.count({ where: { studentId: id } }),
                prisma.monthlyAvailability.count({ where: { studentId: id } }),
                prisma.cancellationCredit.count({ where: { studentId: id } }),
            ])

        if (
            lessonCount + availabilityCount + monthlyAvailabilityCount + creditCount >
            0
        ) {
            return {
                success: false,
                error: "レッスン履歴または希望データがある生徒は削除できません。" as const,
            }
        }

        await prisma.user.delete({
            where: { id },
        })
        revalidateStudentPages(id)
        return { success: true as const }
    } catch (error) {
        console.error("Failed to delete student:", error)
        return { success: false, error: "生徒の削除に失敗しました。" as const }
    }
}
