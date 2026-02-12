import { prisma } from "@/lib/prisma"

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string }
    return e.code === "P2021" || (typeof e.message === "string" && e.message.includes("does not exist"))
}

export async function hasSupportShiftInRange(startTime: Date, endTime: Date) {
    try {
        const shift = await prisma.supportShift.findFirst({
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
    try {
        return await prisma.supportShift.findMany({
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
    } catch (error) {
        if (isMissingRelationError(error)) return []
        throw error
    }
}

