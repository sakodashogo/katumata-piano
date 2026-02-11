"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { z } from "zod"

const StudentSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
})

export async function getStudents() {
    try {
        const students = await prisma.user.findMany({
            where: { role: "STUDENT" },
            orderBy: { createdAt: "desc" },
        })
        return { success: true, data: students }
    } catch (error) {
        console.error("Failed to fetch students:", error)
        return { success: false, error: "Failed to fetch students" }
    }
}

export async function createStudent(formData: FormData) {
    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
    }

    const validatedFields = StudentSchema.safeParse(rawData)

    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" }
    }

    const { name, email } = validatedFields.data
    const hashedPassword = await bcrypt.hash("piano123", 10) // Default temporary password

    try {
        await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: "STUDENT",
            },
        })
        revalidatePath("/teacher/students")
        return { success: true }
    } catch (error) {
        console.error("Failed to create student:", error)
        return { success: false, error: "Failed to create student. Email might already exist." }
    }
}

export async function deleteStudent(id: string) {
    try {
        await prisma.user.delete({
            where: { id },
        })
        revalidatePath("/teacher/students")
        return { success: true }
    } catch (error) {
        console.error("Failed to delete student:", error)
        return { success: false, error: "Failed to delete student" }
    }
}
