"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"
import { z } from "zod"

const StudentSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.preprocess(
        (value) => typeof value === "string" ? value.trim() : value,
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

export async function getStudents() {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const students = await prisma.user.findMany({
            where: { role: "STUDENT" },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                defaultLessonCount: true,
            },
            orderBy: { createdAt: "desc" },
        })
        return { success: true, data: students }
    } catch (error) {
        console.error("Failed to fetch students:", error)
        return { success: false, error: "Failed to fetch students" }
    }
}

export async function createStudent(formData: FormData) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
        defaultLessonCount: formData.get("defaultLessonCount"),
    }

    const validatedFields = StudentSchema.safeParse(rawData)

    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" }
    }

    const { name } = validatedFields.data
    const email = normalizeEmail(validatedFields.data.email)
    const hashedPassword = await bcrypt.hash("piano123", 10) // Default temporary password

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
        revalidatePath("/teacher/students")
        return { success: true }
    } catch (error) {
        console.error("Failed to create student:", error)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return { success: false, error: "このメールアドレスはすでに使用されています。" }
        }
        return { success: false, error: "生徒の作成に失敗しました。" }
    }
}


export async function deleteStudent(id: string) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const [lessonCount, availabilityCount, monthlyAvailabilityCount, creditCount] = await Promise.all([
            prisma.lesson.count({ where: { studentId: id } }),
            prisma.availability.count({ where: { studentId: id } }),
            prisma.monthlyAvailability.count({ where: { studentId: id } }),
            prisma.cancellationCredit.count({ where: { studentId: id } }),
        ])

        if (lessonCount + availabilityCount + monthlyAvailabilityCount + creditCount > 0) {
            return {
                success: false,
                error: "レッスン履歴または希望データがある生徒は削除できません。",
            }
        }

        await prisma.user.delete({
            where: { id },
        })
        revalidatePath("/teacher/students")
        return { success: true }
    } catch (error) {
        console.error("Failed to delete student:", error)
        return { success: false, error: "生徒の削除に失敗しました。" }
    }
}

export async function updateStudent(id: string, formData: FormData) {
    const session = await requireTeacher()
    if (!session) {
        return { success: false, error: "Unauthorized" }
    }

    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
        defaultLessonCount: formData.get("defaultLessonCount"),
    }

    const validatedFields = StudentSchema.safeParse(rawData)

    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" }
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
        revalidatePath(`/teacher/students/${id}`)
        revalidatePath("/teacher/students")
        return { success: true }
    } catch (error) {
        console.error("Failed to update student:", error)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return { success: false, error: "このメールアドレスはすでに使用されています。" }
        }
        return { success: false, error: "生徒情報の更新に失敗しました。" }
    }
}

