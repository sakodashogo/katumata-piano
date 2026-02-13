"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { eachDayOfInterval, endOfMonth, getDay, startOfDay, startOfMonth } from "date-fns"

type DelegateMethod = (args: unknown) => Promise<unknown>

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

function getClosedDayDelegate() {
    return (prisma as unknown as {
        closedDay?: {
            findMany: DelegateMethod
            findFirst: DelegateMethod
            create: DelegateMethod
            delete: DelegateMethod
            deleteMany: DelegateMethod
        }
    }).closedDay
}

function revalidateClosedDayViews() {
    revalidatePath("/teacher/closed-days")
    revalidatePath("/teacher/schedule")
    revalidatePath("/teacher/support")
    revalidatePath("/teacher/resources")
    revalidatePath("/teacher/schedule/monthly")
    revalidatePath("/student/book")
}

async function requireTeacher() {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        return null
    }
    return session
}

export async function getClosedDaysForMonth(year: number, month: number) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const closedDay = getClosedDayDelegate()
        if (!closedDay || typeof closedDay.findMany !== "function") {
            return { success: true as const, data: [] }
        }

        const monthStart = startOfMonth(new Date(year, month - 1, 1))
        const monthEnd = endOfMonth(monthStart)
        const nextDay = new Date(monthEnd)
        nextDay.setDate(nextDay.getDate() + 1)

        const records = await closedDay.findMany({
            where: {
                date: { gte: monthStart, lt: nextDay },
            },
            orderBy: { date: "asc" },
        }) as Array<{
            id: string
            date: Date
            startTime: string | null
            endTime: string | null
            reason: string | null
        }>

        return { success: true as const, data: records }
    } catch (error) {
        if (isMissingRelationError(error)) return { success: true as const, data: [] }
        return { success: false as const, error: "お休み設定の取得に失敗しました。" }
    }
}

export async function addClosedDay(input: {
    date: string
    startTime?: string | null
    endTime?: string | null
    reason?: string | null
}) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const closedDay = getClosedDayDelegate()
        if (!closedDay || typeof closedDay.create !== "function") {
            return { success: false as const, error: "DB未更新のため登録できません。" }
        }

        const date = startOfDay(new Date(input.date))
        if (Number.isNaN(date.getTime())) {
            return { success: false as const, error: "日付が不正です。" }
        }

        // Check for duplicate
        const existing = await closedDay.findFirst({
            where: {
                date,
                startTime: input.startTime || null,
                endTime: input.endTime || null,
            },
            select: { id: true },
        }) as { id: string } | null

        if (existing) {
            return { success: false as const, error: "同じお休みが既に登録されています。" }
        }

        const created = await closedDay.create({
            data: {
                date,
                startTime: input.startTime || null,
                endTime: input.endTime || null,
                reason: input.reason || null,
            },
        })

        revalidateClosedDayViews()
        return { success: true as const, data: created }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため登録できません。" }
        }
        return { success: false as const, error: "お休み登録に失敗しました。" }
    }
}

export async function addClosedDaysBulk(input: {
    year: number
    month: number
    weekdays: number[]
    startTime?: string | null
    endTime?: string | null
    reason?: string | null
}) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        if (input.weekdays.length === 0) {
            return { success: false as const, error: "曜日を1つ以上選択してください。" }
        }

        const closedDay = getClosedDayDelegate()
        if (!closedDay || typeof closedDay.findFirst !== "function" || typeof closedDay.create !== "function") {
            return { success: false as const, error: "DB未更新のため登録できません。" }
        }

        const monthStart = startOfMonth(new Date(input.year, input.month - 1, 1))
        const monthEnd = endOfMonth(monthStart)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
        const matchedDays = allDays.filter((day) => input.weekdays.includes(getDay(day)))

        let created = 0
        let skipped = 0

        for (const day of matchedDays) {
            const date = startOfDay(day)

            const existing = await closedDay.findFirst({
                where: {
                    date,
                    startTime: input.startTime || null,
                    endTime: input.endTime || null,
                },
                select: { id: true },
            }) as { id: string } | null

            if (existing) {
                skipped++
                continue
            }

            await closedDay.create({
                data: {
                    date,
                    startTime: input.startTime || null,
                    endTime: input.endTime || null,
                    reason: input.reason || null,
                },
            })
            created++
        }

        revalidateClosedDayViews()
        return { success: true as const, created, skipped }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため登録できません。" }
        }
        return { success: false as const, error: "一括登録に失敗しました。" }
    }
}

export async function deleteClosedDay(id: string) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const closedDay = getClosedDayDelegate()
        if (!closedDay || typeof closedDay.delete !== "function") {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }

        await closedDay.delete({ where: { id } })
        revalidateClosedDayViews()
        return { success: true as const }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        return { success: false as const, error: "削除に失敗しました。" }
    }
}

export async function deleteClosedDaysForMonth(year: number, month: number) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const closedDay = getClosedDayDelegate()
        if (!closedDay || typeof closedDay.deleteMany !== "function") {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }

        const monthStart = startOfMonth(new Date(year, month - 1, 1))
        const monthEnd = endOfMonth(monthStart)
        const nextDay = new Date(monthEnd)
        nextDay.setDate(nextDay.getDate() + 1)

        const result = await closedDay.deleteMany({
            where: {
                date: { gte: monthStart, lt: nextDay },
            },
        }) as { count: number }

        revalidateClosedDayViews()
        return { success: true as const, deleted: result.count }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        return { success: false as const, error: "月のお休みクリアに失敗しました。" }
    }
}
