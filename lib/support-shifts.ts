import { prisma } from "@/lib/prisma"

type DelegateMethod = (args: unknown) => Promise<unknown>
type ShiftRange = { startTime: Date; endTime: Date }
type ShiftWithStaff = ShiftRange & {
    id: string
    staff?: { id: string; name: string; active: boolean } | null
}

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

export async function hasSupportShiftInRange(startTime: Date, endTime: Date) {
    const supportShiftDelegate = (prisma as unknown as { supportShift?: { findFirst: DelegateMethod } }).supportShift
    if (!supportShiftDelegate || typeof supportShiftDelegate.findFirst !== "function") {
        return false
    }

    try {
        const shift = await supportShiftDelegate.findFirst({
            where: {
                startTime: { lt: endTime },
                endTime: { gt: startTime },
                staff: { active: true },
            },
            select: { id: true },
        })
        return !!shift
    } catch (error) {
        if (isMissingRelationError(error)) return false
        throw error
    }
}

export async function getSupportShiftsInRangeSafe(startTime: Date, endTime: Date) {
    const supportShiftDelegate = (prisma as unknown as { supportShift?: { findMany: DelegateMethod } }).supportShift
    if (!supportShiftDelegate || typeof supportShiftDelegate.findMany !== "function") {
        return []
    }

    try {
        const shifts = await supportShiftDelegate.findMany({
            where: {
                startTime: { lt: endTime },
                endTime: { gt: startTime },
                staff: { active: true },
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
        return shifts as ShiftWithStaff[]
    } catch (error) {
        if (isMissingRelationError(error)) return []
        throw error
    }
}
