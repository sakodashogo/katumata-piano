"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import {
    getDefaultTeacherWorkingHours,
    normalizeTeacherWorkingHourRanges,
    normalizeTeacherWorkingHoursByDay,
    saveTeacherWorkingHoursSafe,
    type TeacherWorkingHourRange,
    type TeacherWorkingHoursByDay,
} from "@/lib/teacher-working-hours"

export type TeacherWorkingHoursUpdateInput = {
    days: Array<{
        dayOfWeek: number
        ranges: TeacherWorkingHourRange[]
    }>
}

function toWorkingHoursByDay(input: TeacherWorkingHoursUpdateInput) {
    const base = getDefaultTeacherWorkingHours()
    const patch: Partial<Record<number, TeacherWorkingHourRange[]>> = {}

    for (const day of input.days || []) {
        if (!day) continue
        const dayOfWeek = Number(day.dayOfWeek)
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue
        patch[dayOfWeek] = normalizeTeacherWorkingHourRanges(day.ranges)
    }

    return normalizeTeacherWorkingHoursByDay({ ...base, ...patch })
}

function revalidateWorkingHourRelatedViews() {
    revalidatePath("/teacher/schedule")
    revalidatePath("/teacher/schedule/monthly")
    revalidatePath("/teacher/support")
    revalidatePath("/teacher/resources")
    revalidatePath("/teacher/students")
    revalidatePath("/student/availability")
}

export async function updateTeacherWorkingHours(input: TeacherWorkingHoursUpdateInput) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return { success: false as const, error: "Unauthorized" }
    }

    try {
        const normalized = toWorkingHoursByDay(input)
        await saveTeacherWorkingHoursSafe(normalized)

        revalidateWorkingHourRelatedViews()

        return {
            success: true as const,
            data: normalized as TeacherWorkingHoursByDay,
        }
    } catch (error) {
        console.error("updateTeacherWorkingHours failed", error)
        return { success: false as const, error: "営業時間設定の保存に失敗しました。" }
    }
}
