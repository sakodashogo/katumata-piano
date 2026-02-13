import { Prisma } from "@prisma/client"

export type ReservableSlot = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
}

export function ensureContiguousSlots(slots: ReservableSlot[]) {
    if (slots.length === 0) {
        throw new Error("予約枠を選択してください。")
    }

    const sortedSlots = [...slots].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    const roomId = sortedSlots[0].roomId
    if (sortedSlots.some((slot) => slot.roomId !== roomId)) {
        throw new Error("同じ部屋の連続した枠を選択してください。")
    }

    for (let i = 1; i < sortedSlots.length; i++) {
        if (sortedSlots[i - 1].endTime.getTime() !== sortedSlots[i].startTime.getTime()) {
            throw new Error("連続した時間枠を選択してください。")
        }
    }

    return {
        sortedSlots,
        roomId,
        startTime: sortedSlots[0].startTime,
        endTime: sortedSlots[sortedSlots.length - 1].endTime,
    }
}

export async function assertNoReservationConflict(
    tx: Prisma.TransactionClient,
    options: {
        startTime: Date
        endTime: Date
        roomId: string
        studentId: string
        ignoreLessonId?: string
    }
) {
    const roomConflict = await tx.lesson.findFirst({
        where: {
            id: options.ignoreLessonId ? { not: options.ignoreLessonId } : undefined,
            status: { not: "CANCELLED" },
            roomId: options.roomId,
            startTime: { lt: options.endTime },
            endTime: { gt: options.startTime },
        },
        select: { id: true },
    })
    if (roomConflict) {
        throw new Error("同じ時間帯に別の予約が入りました。別の時間を選択してください。")
    }

    const studentConflict = await tx.lesson.findFirst({
        where: {
            id: options.ignoreLessonId ? { not: options.ignoreLessonId } : undefined,
            status: { not: "CANCELLED" },
            studentId: options.studentId,
            startTime: { lt: options.endTime },
            endTime: { gt: options.startTime },
        },
        select: { id: true },
    })
    if (studentConflict) {
        throw new Error("同じ時間帯に既存の予約があります。日時をご確認ください。")
    }
}
