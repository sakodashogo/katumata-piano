"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import bcrypt from "bcryptjs"

const ProfileSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email"),
})

const PasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm password is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
})

export async function updateProfile(formData: FormData) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
    }

    const validatedFields = ProfileSchema.safeParse(rawData)
    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" }
    }

    const { name, email } = validatedFields.data

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { name, email },
        })
        revalidatePath("/")
        return { success: true }
    } catch (error) {
        return { success: false, error: "Failed to update profile. Email might be taken." }
    }
}

export async function changePassword(formData: FormData) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    const rawData = {
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
    }

    const validatedFields = PasswordSchema.safeParse(rawData)
    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields or passwords do not match" }
    }

    const { currentPassword, newPassword } = validatedFields.data

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
        })

        if (!user || !user.password) {
            return { success: false, error: "User not found" }
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password)
        if (!isMatch) {
            return { success: false, error: "Incorrect current password" }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10)

        await prisma.user.update({
            where: { id: session.user.id },
            data: { password: hashedPassword },
        })

        return { success: true }
    } catch (error) {
        return { success: false, error: "Failed to change password" }
    }
}
