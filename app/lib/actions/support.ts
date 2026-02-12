"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

async function requireTeacher() {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return null
    }
    return session
}

export async function getSupportStaff() {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const staff = await prisma.supportStaff.findMany({
            where: { active: true },
            orderBy: { name: "asc" },
        })
        return { success: true as const, data: staff }
    } catch (error) {
        if (isMissingRelationError(error)) return { success: true as const, data: [] }
        return { success: false as const, error: "サポート講師の取得に失敗しました。" }
    }
}

export async function getSupportShiftsInRange(startIso: string, endIso: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const startTime = new Date(startIso)
        const endTime = new Date(endIso)
        const shifts = await prisma.supportShift.findMany({
            where: {
                startTime: { lt: endTime },
                endTime: { gt: startTime },
            },
            include: {
                staff: {
                    select: {
                        id: true,
                        name: true,
                        active: true,
                    },
                },
            },
            orderBy: { startTime: "asc" },
        })
        return { success: true as const, data: shifts }
    } catch (error) {
        if (isMissingRelationError(error)) return { success: true as const, data: [] }
        return { success: false as const, error: "シフト取得に失敗しました。" }
    }
}

export async function upsertSupportShift(input: {
    id?: string
    staffId: string
    startTime: string
    endTime: string
}) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const startTime = new Date(input.startTime)
        const endTime = new Date(input.endTime)
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || startTime >= endTime) {
            return { success: false as const, error: "開始/終了時刻が不正です。" }
        }

        const overlap = await prisma.supportShift.findFirst({
            where: {
                id: input.id ? { not: input.id } : undefined,
                staffId: input.staffId,
                startTime: { lt: endTime },
                endTime: { gt: startTime },
            },
            select: { id: true },
        })
        if (overlap) {
            return { success: false as const, error: "同じ講師のシフトが重複しています。" }
        }

        const data = input.id
            ? await prisma.supportShift.update({
                where: { id: input.id },
                data: { staffId: input.staffId, startTime, endTime },
            })
            : await prisma.supportShift.create({
                data: { staffId: input.staffId, startTime, endTime },
            })

        revalidatePath("/teacher/resources")
        revalidatePath("/teacher/schedule")
        revalidatePath("/teacher/schedule/monthly")
        revalidatePath("/student/book")
        return { success: true as const, data }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のためシフト保存できません。マイグレーション適用後に再実行してください。" }
        }
        return { success: false as const, error: "シフト保存に失敗しました。" }
    }
}

export async function deleteSupportShift(id: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        await prisma.supportShift.delete({ where: { id } })
        revalidatePath("/teacher/resources")
        revalidatePath("/teacher/schedule")
        revalidatePath("/teacher/schedule/monthly")
        revalidatePath("/student/book")
        return { success: true as const }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        return { success: false as const, error: "削除に失敗しました。" }
    }
}

