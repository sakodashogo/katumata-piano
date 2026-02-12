"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { eachDayOfInterval, endOfMonth, getDay, setHours, setMinutes, startOfMonth } from "date-fns"

type DelegateMethod = (args: unknown) => Promise<unknown>

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

function getSupportStaffDelegate() {
    return (prisma as unknown as {
        supportStaff?: {
            findMany: DelegateMethod
            findFirst: DelegateMethod
            create: DelegateMethod
            update: DelegateMethod
        }
    }).supportStaff
}

function getSupportShiftDelegate() {
    return (prisma as unknown as {
        supportShift?: {
            findMany: DelegateMethod
            findFirst: DelegateMethod
            update: DelegateMethod
            create: DelegateMethod
            delete: DelegateMethod
        }
    }).supportShift
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
        const supportStaff = getSupportStaffDelegate()
        if (!supportStaff || typeof supportStaff.findMany !== "function") {
            return { success: true as const, data: [] }
        }
        const staff = await supportStaff.findMany({
            orderBy: [{ active: "desc" }, { name: "asc" }],
        }) as Array<{ id: string; name: string; active: boolean }>
        return { success: true as const, data: staff }
    } catch (error) {
        if (isMissingRelationError(error)) return { success: true as const, data: [] }
        return { success: false as const, error: "サポート講師の取得に失敗しました。" }
    }
}

export async function createSupportStaff(name: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    const trimmed = name.trim()
    if (!trimmed) return { success: false as const, error: "講師名を入力してください。" }

    try {
        const supportStaff = getSupportStaffDelegate()
        if (!supportStaff || typeof supportStaff.create !== "function") {
            return { success: false as const, error: "DB未更新のため講師登録できません。" }
        }
        const existing = await supportStaff.findFirst({
            where: { name: trimmed },
            select: { id: true },
        }) as { id: string } | null
        if (existing) {
            return { success: false as const, error: "同名のサポート講師が既にいます。" }
        }
        const created = await supportStaff.create({
            data: { name: trimmed, active: true },
        }) as { id: string; name: string; active: boolean }
        revalidatePath("/teacher/resources")
        return { success: true as const, data: created }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため講師登録できません。" }
        }
        return { success: false as const, error: "講師登録に失敗しました。" }
    }
}

export async function setSupportStaffActive(id: string, active: boolean) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const supportStaff = getSupportStaffDelegate()
        if (!supportStaff || typeof supportStaff.update !== "function") {
            return { success: false as const, error: "DB未更新のため更新できません。" }
        }
        await supportStaff.update({
            where: { id },
            data: { active },
        })
        revalidatePath("/teacher/resources")
        revalidatePath("/teacher/schedule")
        revalidatePath("/teacher/schedule/monthly")
        revalidatePath("/student/book")
        return { success: true as const }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため更新できません。" }
        }
        return { success: false as const, error: "講師状態の更新に失敗しました。" }
    }
}

export async function getSupportShiftsInRange(startIso: string, endIso: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const startTime = new Date(startIso)
        const endTime = new Date(endIso)
        const supportShift = getSupportShiftDelegate()
        if (!supportShift || typeof supportShift.findMany !== "function") {
            return { success: true as const, data: [] }
        }
        const shifts = await supportShift.findMany({
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
        }) as Array<{
            id: string
            staffId: string
            startTime: Date
            endTime: Date
            staff?: { id: string; name: string; active: boolean } | null
        }>
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

        const supportShift = getSupportShiftDelegate()
        if (!supportShift) {
            return { success: false as const, error: "DB未更新のためシフト保存できません。マイグレーション適用後に再実行してください。" }
        }

        const overlap = await supportShift.findFirst({
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
            ? await supportShift.update({
                where: { id: input.id },
                data: { staffId: input.staffId, startTime, endTime },
            })
            : await supportShift.create({
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

export async function createMonthlySupportShifts(input: {
    staffId: string
    year: number
    month: number
    weekdays: number[]
    startHour: number
    startMinute: number
    endHour: number
    endMinute: number
}) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        if (input.weekdays.length === 0) {
            return { success: false as const, error: "曜日を1つ以上選択してください。" }
        }
        const monthStart = startOfMonth(new Date(input.year, input.month - 1, 1))
        const monthEnd = endOfMonth(monthStart)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
        const matchedDays = allDays.filter((day) => input.weekdays.includes(getDay(day)))

        const supportShift = getSupportShiftDelegate()
        if (!supportShift || typeof supportShift.findMany !== "function" || typeof supportShift.create !== "function") {
            return { success: false as const, error: "DB未更新のため月間登録できません。" }
        }

        let created = 0
        let skipped = 0
        for (const day of matchedDays) {
            const startTime = setMinutes(setHours(new Date(day), input.startHour), input.startMinute)
            const endTime = setMinutes(setHours(new Date(day), input.endHour), input.endMinute)
            if (endTime <= startTime) {
                skipped++
                continue
            }
            const overlap = await supportShift.findFirst({
                where: {
                    staffId: input.staffId,
                    startTime: { lt: endTime },
                    endTime: { gt: startTime },
                },
                select: { id: true },
            }) as { id: string } | null
            if (overlap) {
                skipped++
                continue
            }
            await supportShift.create({
                data: { staffId: input.staffId, startTime, endTime },
            })
            created++
        }

        revalidatePath("/teacher/resources")
        revalidatePath("/teacher/schedule")
        revalidatePath("/teacher/schedule/monthly")
        revalidatePath("/student/book")
        return { success: true as const, created, skipped }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため月間登録できません。" }
        }
        return { success: false as const, error: "月間シフト登録に失敗しました。" }
    }
}

export async function deleteSupportShift(id: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const supportShift = getSupportShiftDelegate()
        if (!supportShift || typeof supportShift.delete !== "function") {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        await supportShift.delete({ where: { id } })
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
