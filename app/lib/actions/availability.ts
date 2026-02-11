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
