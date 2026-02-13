export type SlotSegment = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
}

export type SupportShiftWindow = {
    startTime: Date
    endTime: Date
}

export type BookableStartTime = {
    startTime: Date
    endTime: Date
    roomId: string
    slotIds: string[]
}

function requiresSupportForRoomB(lessonType: string) {
    return lessonType !== "PRACTICE"
}

function hasSupportOverlap(shifts: SupportShiftWindow[], startTime: Date, endTime: Date) {
    return shifts.some((shift) => shift.startTime < endTime && shift.endTime > startTime)
}

export function filterSlotsBySupport(
    slots: SlotSegment[],
    supportShifts: SupportShiftWindow[],
    lessonType: string
) {
    return slots.filter((slot) => {
        if (slot.roomId !== "B") return true
        if (!requiresSupportForRoomB(lessonType)) return true
        return hasSupportOverlap(supportShifts, slot.startTime, slot.endTime)
    })
}

export function buildBookableStartTimes(slots: SlotSegment[], durationMin: number) {
    const requiredDuration = Math.max(30, durationMin)
    const byRoom = new Map<string, SlotSegment[]>()

    for (const slot of slots) {
        if (!byRoom.has(slot.roomId)) byRoom.set(slot.roomId, [])
        byRoom.get(slot.roomId)!.push(slot)
    }

    const candidates: BookableStartTime[] = []

    for (const [, roomSlots] of byRoom) {
        roomSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

        for (let i = 0; i < roomSlots.length; i++) {
            const chain: SlotSegment[] = [roomSlots[i]]
            const chainStart = roomSlots[i].startTime
            let chainEnd = roomSlots[i].endTime

            if ((chainEnd.getTime() - chainStart.getTime()) / 60000 >= requiredDuration) {
                candidates.push({
                    startTime: chainStart,
                    endTime: chainEnd,
                    roomId: roomSlots[i].roomId,
                    slotIds: chain.map((s) => s.id),
                })
                continue
            }

            for (let j = i + 1; j < roomSlots.length; j++) {
                const prev = chain[chain.length - 1]
                const next = roomSlots[j]
                if (prev.endTime.getTime() !== next.startTime.getTime()) {
                    break
                }
                chain.push(next)
                chainEnd = next.endTime

                if ((chainEnd.getTime() - chainStart.getTime()) / 60000 >= requiredDuration) {
                    candidates.push({
                        startTime: chainStart,
                        endTime: chainEnd,
                        roomId: chain[0].roomId,
                        slotIds: chain.map((s) => s.id),
                    })
                    break
                }
            }
        }
    }

    candidates.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    return candidates
}
