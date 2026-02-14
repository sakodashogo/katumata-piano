"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath, revalidateTag } from "next/cache"
import { CLOSED_DAYS_CACHE_TAG } from "@/lib/closed-days"
import { addDays, eachDayOfInterval, endOfMonth, getDay, startOfDay, startOfMonth } from "date-fns"

type DelegateMethod = (args: unknown) => Promise<unknown>

type ClosedDayPayload = {
    id: string
    date: Date
    startTime: string | null
    endTime: string | null
    reason: string | null
}

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

function getClosedDayDelegate(client: unknown = prisma) {
    return (client as {
        closedDay?: {
            findMany: DelegateMethod
            findFirst: DelegateMethod
            create: DelegateMethod
            delete: DelegateMethod
            deleteMany: DelegateMethod
        }
    }).closedDay
}

function getClosedDayPublicationDelegate(client: unknown = prisma) {
    return (client as {
        closedDayPublication?: {
            findFirst: DelegateMethod
            upsert: DelegateMethod
        }
    }).closedDayPublication
}

function getPublishedClosedDayDelegate(client: unknown = prisma) {
    return (client as {
        publishedClosedDay?: {
            findMany: DelegateMethod
            deleteMany: DelegateMethod
            createMany?: DelegateMethod
            create?: DelegateMethod
        }
    }).publishedClosedDay
}

function getMonthRange(year: number, month: number) {
    const monthStart = startOfMonth(new Date(year, month - 1, 1))
    const monthEndExclusive = addDays(endOfMonth(monthStart), 1)
    return { monthStart, monthEndExclusive }
}

function toDateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function toSnapshotKey(input: { date: Date; startTime: string | null; endTime: string | null; reason: string | null }) {
    return `${toDateKey(new Date(input.date))}|${input.startTime || ""}|${input.endTime || ""}|${input.reason || ""}`
}

function hasUnpublishedDifference(drafts: ClosedDayPayload[], published: ClosedDayPayload[]) {
    if (drafts.length !== published.length) return true
    const draftKeys = new Set(drafts.map((item) => toSnapshotKey(item)))
    const publishedKeys = new Set(published.map((item) => toSnapshotKey(item)))
    if (draftKeys.size !== publishedKeys.size) return true
    for (const key of draftKeys) {
        if (!publishedKeys.has(key)) return true
    }
    return false
}

function revalidateClosedDayDraftViews() {
    revalidatePath("/teacher/closed-days")
    revalidatePath("/teacher/schedule")
    revalidatePath("/teacher/support")
    revalidatePath("/teacher/resources")
    revalidatePath("/teacher/schedule/monthly")
    revalidateTag(CLOSED_DAYS_CACHE_TAG, "max")
}

function revalidateClosedDayPublicationViews() {
    revalidatePath("/teacher/closed-days")
    revalidatePath("/student/book")
    revalidateTag(CLOSED_DAYS_CACHE_TAG, "max")
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

        const { monthStart, monthEndExclusive } = getMonthRange(year, month)
        const records = await closedDay.findMany({
            where: {
                date: { gte: monthStart, lt: monthEndExclusive },
            },
            orderBy: { date: "asc" },
        }) as ClosedDayPayload[]

        return { success: true as const, data: records }
    } catch (error) {
        if (isMissingRelationError(error)) return { success: true as const, data: [] }
        return { success: false as const, error: "お休み設定の取得に失敗しました。" }
    }
}

export async function getClosedDayPublicationStatus(year: number, month: number) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }

    try {
        const closedDay = getClosedDayDelegate()
        const publicationDelegate = getClosedDayPublicationDelegate()
        const publishedDelegate = getPublishedClosedDayDelegate()
        const { monthStart, monthEndExclusive } = getMonthRange(year, month)

        const drafts = closedDay && typeof closedDay.findMany === "function"
            ? await closedDay.findMany({
                where: { date: { gte: monthStart, lt: monthEndExclusive } },
                orderBy: { date: "asc" },
            }) as ClosedDayPayload[]
            : []

        if (
            !publicationDelegate ||
            typeof publicationDelegate.findFirst !== "function" ||
            !publishedDelegate ||
            typeof publishedDelegate.findMany !== "function"
        ) {
            return {
                success: true as const,
                data: {
                    publishedAt: null,
                    publishedBy: null,
                    draftCount: drafts.length,
                    publishedCount: 0,
                    hasUnpublishedChanges: drafts.length > 0,
                },
            }
        }

        const publication = await publicationDelegate.findFirst({
            where: { year, month },
            include: {
                teacher: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
            },
        }) as {
            id: string
            publishedAt: Date
            teacher?: { name: string | null; email: string | null } | null
        } | null

        if (!publication) {
            return {
                success: true as const,
                data: {
                    publishedAt: null,
                    publishedBy: null,
                    draftCount: drafts.length,
                    publishedCount: 0,
                    hasUnpublishedChanges: drafts.length > 0,
                },
            }
        }

        const published = await publishedDelegate.findMany({
            where: { publicationId: publication.id },
            orderBy: { date: "asc" },
        }) as ClosedDayPayload[]

        return {
            success: true as const,
            data: {
                publishedAt: publication.publishedAt,
                publishedBy: publication.teacher?.name || publication.teacher?.email || null,
                draftCount: drafts.length,
                publishedCount: published.length,
                hasUnpublishedChanges: hasUnpublishedDifference(drafts, published),
            },
        }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return {
                success: true as const,
                data: {
                    publishedAt: null,
                    publishedBy: null,
                    draftCount: 0,
                    publishedCount: 0,
                    hasUnpublishedChanges: false,
                },
            }
        }
        return { success: false as const, error: "お休み公開状態の取得に失敗しました。" }
    }
}

export async function publishClosedDaysForMonth(year: number, month: number) {
    const session = await requireTeacher()
    if (!session) return { success: false as const, error: "Unauthorized" }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return { success: false as const, error: "年月が不正です。" }
    }

    try {
        const now = new Date()
        const { monthStart, monthEndExclusive } = getMonthRange(year, month)
        const result = await prisma.$transaction(async (tx) => {
            const closedDay = getClosedDayDelegate(tx)
            const publicationDelegate = getClosedDayPublicationDelegate(tx)
            const publishedDelegate = getPublishedClosedDayDelegate(tx)
            if (
                !closedDay ||
                typeof closedDay.findMany !== "function" ||
                !publicationDelegate ||
                typeof publicationDelegate.upsert !== "function" ||
                !publishedDelegate ||
                typeof publishedDelegate.deleteMany !== "function"
            ) {
                throw new Error("DB_NOT_READY")
            }

            const drafts = await closedDay.findMany({
                where: { date: { gte: monthStart, lt: monthEndExclusive } },
                orderBy: { date: "asc" },
            }) as ClosedDayPayload[]

            const publication = await publicationDelegate.upsert({
                where: { year_month: { year, month } },
                update: {
                    publishedAt: now,
                    publishedBy: session.user.id ?? null,
                },
                create: {
                    year,
                    month,
                    publishedAt: now,
                    publishedBy: session.user.id ?? null,
                },
                select: { id: true },
            }) as { id: string }

            await publishedDelegate.deleteMany({
                where: { publicationId: publication.id },
            })

            if (drafts.length > 0) {
                const payload = drafts.map((item) => ({
                    publicationId: publication.id,
                    date: startOfDay(new Date(item.date)),
                    startTime: item.startTime || null,
                    endTime: item.endTime || null,
                    reason: item.reason || null,
                }))
                if (typeof publishedDelegate.createMany === "function") {
                    await publishedDelegate.createMany({
                        data: payload,
                    })
                } else if (typeof publishedDelegate.create === "function") {
                    for (const row of payload) {
                        await publishedDelegate.create({
                            data: row,
                        })
                    }
                }
            }

            return {
                publishedCount: drafts.length,
            }
        })

        revalidateClosedDayDraftViews()
        revalidateClosedDayPublicationViews()
        return { success: true as const, publishedCount: result.publishedCount }
    } catch (error) {
        if (error instanceof Error && error.message === "DB_NOT_READY") {
            return { success: false as const, error: "DB未更新のため公開できません。" }
        }
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため公開できません。" }
        }
        return { success: false as const, error: "お休み公開に失敗しました。" }
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

        revalidateClosedDayDraftViews()
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

        revalidateClosedDayDraftViews()
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
        revalidateClosedDayDraftViews()
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

        const { monthStart, monthEndExclusive } = getMonthRange(year, month)
        const result = await closedDay.deleteMany({
            where: {
                date: { gte: monthStart, lt: monthEndExclusive },
            },
        }) as { count: number }

        revalidateClosedDayDraftViews()
        return { success: true as const, deleted: result.count }
    } catch (error) {
        if (isMissingRelationError(error)) {
            return { success: false as const, error: "DB未更新のため削除できません。" }
        }
        return { success: false as const, error: "月のお休みクリアに失敗しました。" }
    }
}
