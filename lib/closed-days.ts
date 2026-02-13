import { prisma } from "@/lib/prisma"

type DelegateMethod = (args: unknown) => Promise<unknown>

export type ClosedDayScope = "teacher" | "student"
export type ClosedDayQueryOptions = {
    scope?: ClosedDayScope
}

export type ClosedDayRecord = {
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

function getClosedDayDelegates() {
    const delegate = prisma as unknown as {
        closedDay?: { findMany: DelegateMethod }
        publishedClosedDay?: { findMany: DelegateMethod }
    }
    return {
        draft: delegate.closedDay,
        published: delegate.publishedClosedDay,
    }
}

export async function getClosedDaysInRangeSafe(
    start: Date,
    end: Date,
    options?: ClosedDayQueryOptions
): Promise<ClosedDayRecord[]> {
    const scope = options?.scope ?? "teacher"
    const { draft, published } = getClosedDayDelegates()
    const delegate = scope === "student" ? published : draft
    if (!delegate || typeof delegate.findMany !== "function") {
        return []
    }

    try {
        const records = await delegate.findMany({
            where: {
                date: { gte: start, lt: end },
            },
            orderBy: { date: "asc" },
        })
        return records as ClosedDayRecord[]
    } catch (error) {
        if (isMissingRelationError(error)) return []
        throw error
    }
}

/**
 * Check if a 30-min slot falls within a closed period.
 * slotStart/slotEnd are Date objects representing the slot's time range.
 */
export function isSlotClosed(closedDays: ClosedDayRecord[], slotStart: Date, slotEnd: Date): boolean {
    const slotDateStr = `${slotStart.getFullYear()}-${String(slotStart.getMonth() + 1).padStart(2, "0")}-${String(slotStart.getDate()).padStart(2, "0")}`

    for (const closed of closedDays) {
        const closedDate = new Date(closed.date)
        const closedDateStr = `${closedDate.getFullYear()}-${String(closedDate.getMonth() + 1).padStart(2, "0")}-${String(closedDate.getDate()).padStart(2, "0")}`

        if (closedDateStr !== slotDateStr) continue

        // Whole-day closure
        if (!closed.startTime || !closed.endTime) {
            return true
        }

        // Partial closure: check time overlap
        const [closedStartH, closedStartM] = closed.startTime.split(":").map(Number)
        const [closedEndH, closedEndM] = closed.endTime.split(":").map(Number)
        const closedStartMin = closedStartH * 60 + closedStartM
        const closedEndMin = closedEndH * 60 + closedEndM

        const slotStartMin = slotStart.getHours() * 60 + slotStart.getMinutes()
        const slotEndMin = slotEnd.getHours() * 60 + slotEnd.getMinutes()

        // Overlap check
        if (slotStartMin < closedEndMin && slotEndMin > closedStartMin) {
            return true
        }
    }

    return false
}
