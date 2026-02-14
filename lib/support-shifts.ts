import { prisma } from "@/lib/prisma"
import { unstable_cache } from "next/cache"

type DelegateMethod = (args: unknown) => Promise<unknown>
type ShiftRange = { startTime: Date; endTime: Date }
type ShiftWithStaff = ShiftRange & {
    id: string
    staff?: { id: string; name: string; active: boolean } | null
}

export const SUPPORT_SHIFTS_CACHE_TAG = "support-shifts"
const SUPPORT_SHIFTS_CACHE_REVALIDATE_SECONDS = 60

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
    const shifts = await getSupportShiftsInRangeCached(startTime.toISOString(), endTime.toISOString())
    return shifts.map((shift) => ({
        ...shift,
        startTime: new Date(shift.startTime),
        endTime: new Date(shift.endTime),
    }))
}

async function fetchSupportShiftsInRangeUncached(startTime: Date, endTime: Date): Promise<ShiftWithStaff[]> {
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
        return (shifts as ShiftWithStaff[]).map((shift) => ({
            ...shift,
            startTime: new Date(shift.startTime),
            endTime: new Date(shift.endTime),
        }))
    } catch (error) {
        if (isMissingRelationError(error)) return []
        throw error
    }
}

const getSupportShiftsInRangeCached = unstable_cache(
    async (startIso: string, endIso: string) => {
        const shifts = await fetchSupportShiftsInRangeUncached(new Date(startIso), new Date(endIso))
        return shifts.map((shift) => ({
            ...shift,
            startTime: shift.startTime.toISOString(),
            endTime: shift.endTime.toISOString(),
        }))
    },
    ["support-shifts-range:v1"],
    { revalidate: SUPPORT_SHIFTS_CACHE_REVALIDATE_SECONDS, tags: [SUPPORT_SHIFTS_CACHE_TAG] }
)
