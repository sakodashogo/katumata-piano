"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const AvailabilitySchema = z.object({
    days: z.array(z.string()),
    note: z.string().optional(),
})

export async function saveAvailability(formData: FormData) {
    const session = await auth()
    if (!session?.user?.id) return { success: false, error: "Unauthorized" }

    const rawData = {
        days: formData.getAll("days"),
        note: formData.get("note"),
    }

    const validatedFields = AvailabilitySchema.safeParse(rawData)

    if (!validatedFields.success) {
        return { success: false, error: "Invalid fields" }
    }

    const { days, note } = validatedFields.data

    try {
        // Upsert logic: Update if exists, create if not
        // Since we don't have a unique constraint on studentId in Availability model (yet),
        // we'll findFirst and update, or create.
        // Ideally schema should have @unique on studentId if 1:1, but 1:N history is also fine.
        // For now, let's treat it as "Latest Submission"

        await prisma.availability.create({
            data: {
                studentId: session.user.id,
                days: days, // Prisma handles string[] -> Json
                note: note,
            }
        })

        revalidatePath("/student")
        return { success: true }
    } catch (error) {
        console.error("Failed to save availability:", error)
        return { success: false, error: "Failed to save availability" }
    }
}

export async function getLatestAvailability(studentId: string) {
    try {
        const availability = await prisma.availability.findFirst({
            where: { studentId },
            orderBy: { createdAt: "desc" }
        })
        return { success: true, data: availability }
    } catch (error) {
        return { success: false, error: "Failed to fetch availability" }
    }
}

export async function getMonthlyAvailability(studentId: string, year: number, month: number) {
    const session = await auth()
    if (!session?.user) return { success: false, error: "Unauthorized" }

    // Allow student to see own, or teacher to see any
    if (session.user.role !== "TEACHER" && session.user.id !== studentId) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const availability = await prisma.monthlyAvailability.findUnique({
            where: {
                studentId_year_month: {
                    studentId,
                    year,
                    month
                }
            }
        })
        return { success: true, data: availability }
    } catch (error) {
        console.error("Failed to fetch availability:", error)
        return { success: false, error: "Failed to fetch availability" }
    }
}

export async function saveMonthlyAvailability(
    studentId: string,
    year: number,
    month: number,
    data: { availableSlots: string[], unavailableSlots: string[] }
) {
    const session = await auth()
    if (!session?.user) return { success: false, error: "Unauthorized" }

    // Allow student to edit own, or teacher to edit any
    if (session.user.role !== "TEACHER" && session.user.id !== studentId) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const availability = await prisma.monthlyAvailability.upsert({
            where: {
                studentId_year_month: {
                    studentId,
                    year,
                    month
                }
            },
            update: {
                availableSlots: data.availableSlots,
                unavailableSlots: data.unavailableSlots,
            },
            create: {
                studentId,
                year,
                month,
                availableSlots: data.availableSlots,
                unavailableSlots: data.unavailableSlots,
            }
        })

        revalidatePath(`/teacher/schedule/monthly`)
        revalidatePath(`/teacher/students/${studentId}`)
        return { success: true, data: availability }
    } catch (error) {
        console.error("Failed to save availability:", error)
        return { success: false, error: "Failed to save availability" }
    }
}
