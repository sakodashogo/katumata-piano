"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { format, addDays, startOfWeek, setHours, setMinutes, startOfDay } from "date-fns"
import { ja } from "date-fns/locale"
import { Loader2, ChevronLeft, ChevronRight, PenLine, Copy } from "lucide-react"
import { getStudentColorClasses } from "@/lib/student-color"
import { useToast } from "@/components/ui/toast"

type Lesson = {
    id: string
    studentId?: string
    studentName?: string
    startTime: Date | string
    endTime: Date | string
    roomId?: string | null
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL" | string
    status?: string
    isEditable?: boolean
}

type DraftLesson = {
    startTime: Date
    endTime: Date
    roomId: string
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
}

type DraftLessonType = "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"

type CellPos = { row: number; gridCol: number }

type Props = {
    studentId: string
    studentName: string
    availableSlots: string[]
    unavailableSlots: string[]
    existingLessons: Lesson[]
    year: number
    month: number
    supportShifts?: Array<{ startTime: Date | string; endTime: Date | string }>
    onSave?: (lessons: DraftLesson[]) => Promise<boolean>
    onDraftChange?: (lessons: DraftLesson[]) => void
    readOnly?: boolean
    showSaveControls?: boolean
    className?: string
}

const START_HOUR = 9
const END_HOUR = 22

function areSetsEqual(left: Set<string>, right: Set<string>) {
    if (left.size !== right.size) return false
    for (const value of left) {
        if (!right.has(value)) return false
    }
    return true
}

function areMapsEqual<K, V>(left: Map<K, V>, right: Map<K, V>) {
    if (left.size !== right.size) return false
    for (const [key, value] of left) {
        if (!right.has(key) || right.get(key) !== value) return false
    }
    return true
}

function mapEntriesToKey<K extends string, V extends string>(map: Map<K, V>) {
    return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join("|")
}

export function MonthlySlotGridEditor({
    studentId,
    studentName,
    availableSlots,
    unavailableSlots,
    existingLessons,
    year,
    month,
    supportShifts = [],
    onSave,
    onDraftChange,
    readOnly = false,
    showSaveControls = true,
    className,
}: Props) {
    const { toast } = useToast()
    const monthStart = new Date(year, month - 1, 1)
    const [weekStart, setWeekStart] = React.useState(() =>
        startOfWeek(monthStart, { weekStartsOn: 1 })
    )
    const [isSaving, setIsSaving] = React.useState(false)

    React.useEffect(() => {
        setWeekStart(startOfWeek(new Date(year, month - 1, 1), { weekStartsOn: 1 }))
    }, [year, month, studentId])

    const days = React.useMemo(
        () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
        [weekStart]
    )
    const timeSlots = React.useMemo(() => {
        const slots: { hour: number; minute: number; label: string }[] = []
        for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
            slots.push({ hour, minute: 0, label: `${hour}:00` })
            if (hour < END_HOUR) {
                slots.push({ hour, minute: 30, label: `${hour}:30` })
            }
        }
        return slots
    }, [])

    const availableSet = React.useMemo(() => new Set(availableSlots), [availableSlots])
    const unavailableSet = React.useMemo(() => new Set(unavailableSlots), [unavailableSlots])

    const parsedSupportShifts = React.useMemo(
        () => supportShifts.map((shift) => ({
            startTime: new Date(shift.startTime),
            endTime: new Date(shift.endTime),
        })),
        [supportShifts]
    )

    const nonEditableByRoom = React.useMemo(() => {
        const map = new Map<string, Set<number>>()
        map.set("A", new Set())
        map.set("B", new Set())
        for (const lesson of existingLessons.filter((item) => !item.isEditable)) {
            const roomId = lesson.roomId === "B" ? "B" : "A"
            map.get(roomId)?.add(new Date(lesson.startTime).getTime())
        }
        return map
    }, [existingLessons])

    const nonEditableTypeByRoomIso = React.useMemo(() => {
        const map = new Map<string, string>()
        for (const lesson of existingLessons.filter((item) => !item.isEditable)) {
            const roomId = lesson.roomId === "B" ? "B" : "A"
            const iso = new Date(lesson.startTime).toISOString()
            map.set(`${roomId}:${iso}`, lesson.type || "REGULAR")
        }
        return map
    }, [existingLessons])

    const nonEditableStudentByRoomIso = React.useMemo(() => {
        const map = new Map<string, { studentId: string; studentName: string }>()
        for (const lesson of existingLessons.filter((item) => !item.isEditable)) {
            const roomId = lesson.roomId === "B" ? "B" : "A"
            const iso = new Date(lesson.startTime).toISOString()
            map.set(`${roomId}:${iso}`, {
                studentId: lesson.studentId || "unknown",
                studentName: lesson.studentName || "名前未設定",
            })
        }
        return map
    }, [existingLessons])

    const editableLessonsByIso = React.useMemo(() => {
        const map = new Map<string, "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">()
        for (const lesson of existingLessons.filter((item) => !!item.isEditable)) {
            const start = new Date(lesson.startTime)
            if (Number.isNaN(start.getTime())) continue
            map.set(
                start.toISOString(),
                (lesson.type as "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL") || "REGULAR"
            )
        }
        return map
    }, [existingLessons])

    const editableRoomByIso = React.useMemo(() => {
        const map = new Map<string, "A" | "B">()
        for (const lesson of existingLessons.filter((item) => !!item.isEditable)) {
            map.set(new Date(lesson.startTime).toISOString(), lesson.roomId === "B" ? "B" : "A")
        }
        return map
    }, [existingLessons])
    const editableSlotSet = React.useMemo(
        () => new Set(Array.from(editableLessonsByIso.keys())),
        [editableLessonsByIso]
    )

    const [draftSlots, setDraftSlots] = React.useState<Set<string>>(new Set(Array.from(editableLessonsByIso.keys())))
    const [draftTypes, setDraftTypes] = React.useState<Map<string, DraftLessonType>>(new Map(editableLessonsByIso))
    const [draftRooms, setDraftRooms] = React.useState<Map<string, "A" | "B">>(new Map(editableRoomByIso))
    const draftSlotsRef = React.useRef(draftSlots)
    draftSlotsRef.current = draftSlots
    const draftTypesRef = React.useRef(draftTypes)
    draftTypesRef.current = draftTypes
    const draftRoomsRef = React.useRef(draftRooms)
    draftRoomsRef.current = draftRooms
    const [selectedLessonType, setSelectedLessonType] = React.useState<"REGULAR" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">("REGULAR")

    const editableSyncKey = React.useMemo(() => {
        const slotsKey = Array.from(editableSlotSet).sort().join("|")
        const typeKey = mapEntriesToKey(editableLessonsByIso)
        const roomKey = mapEntriesToKey(editableRoomByIso)
        return `${studentId}__${year}-${month}__${slotsKey}__${typeKey}__${roomKey}`
    }, [editableLessonsByIso, editableRoomByIso, editableSlotSet, month, studentId, year])
    const lastAppliedSyncKeyRef = React.useRef<string>("")
    const lastSyncKeyForDraftRef = React.useRef<string>("")

    React.useEffect(() => {
        if (lastAppliedSyncKeyRef.current === editableSyncKey) return
        lastAppliedSyncKeyRef.current = editableSyncKey
        if (!areSetsEqual(draftSlotsRef.current, editableSlotSet)) {
            setDraftSlots(new Set(editableSlotSet))
        }
        if (!areMapsEqual(draftTypesRef.current, editableLessonsByIso)) {
            setDraftTypes(new Map(editableLessonsByIso))
        }
        if (!areMapsEqual(draftRoomsRef.current, editableRoomByIso)) {
            setDraftRooms(new Map(editableRoomByIso))
        }
    }, [editableLessonsByIso, editableRoomByIso, editableSlotSet, editableSyncKey])

    const isPaintingRef = React.useRef(false)
    const paintTypeRef = React.useRef<"draft" | "neutral">("draft")
    const startCellRef = React.useRef<CellPos | null>(null)
    const currentCellRef = React.useRef<CellPos | null>(null)
    const [, forceRender] = React.useState(0)
    const rerender = () => forceRender((value) => value + 1)
    const gridRef = React.useRef<HTMLDivElement>(null)

    const daysRef = React.useRef(days)
    daysRef.current = days
    const timeSlotsRef = React.useRef(timeSlots)
    timeSlotsRef.current = timeSlots

    const getCellIso = (day: Date, hour: number, minute: number) =>
        setMinutes(setHours(startOfDay(day), hour), minute).toISOString()

    const isBooked = React.useCallback(
        (iso: string, roomId: "A" | "B") => nonEditableByRoom.get(roomId)?.has(new Date(iso).getTime()) ?? false,
        [nonEditableByRoom]
    )

    const hasSupportAt = React.useCallback((iso: string) => {
        const start = new Date(iso)
        const end = new Date(start.getTime() + 30 * 60 * 1000)
        return parsedSupportShifts.some((shift) => shift.startTime < end && shift.endTime > start)
    }, [parsedSupportShifts])

    const isBlockedBySupport = React.useCallback((iso: string, roomId: "A" | "B", lessonType: DraftLessonType = selectedLessonType) => {
        if (roomId !== "B") return false
        if (lessonType === "PRACTICE") return false
        return !hasSupportAt(iso)
    }, [hasSupportAt, selectedLessonType])

    const isDayInMonth = (day: Date) => day.getMonth() === month - 1 && day.getFullYear() === year

    const getSlotStatus = (iso: string, roomId: "A" | "B"): string => {
        if (isBooked(iso, roomId)) return `booked:${nonEditableTypeByRoomIso.get(`${roomId}:${iso}`) || "REGULAR"}`
        if (draftSlots.has(iso) && (draftRooms.get(iso) || "A") === roomId) {
            return `draft:${draftTypes.get(iso) || "REGULAR"}`
        }
        if (isBlockedBySupport(iso, roomId)) return "no_support"
        if (availableSet.has(iso)) return "available"
        if (unavailableSet.has(iso)) return "unavailable"
        return "neutral"
    }

    const isInPendingRect = (row: number, gridCol: number) => {
        const start = startCellRef.current
        const current = currentCellRef.current
        if (!start || !current || !isPaintingRef.current) return false
        const minRow = Math.min(start.row, current.row)
        const maxRow = Math.max(start.row, current.row)
        const minCol = Math.min(start.gridCol, current.gridCol)
        const maxCol = Math.max(start.gridCol, current.gridCol)
        return row >= minRow && row <= maxRow && gridCol >= minCol && gridCol <= maxCol
    }

    const getRectCells = React.useCallback(() => {
        const start = startCellRef.current
        const current = currentCellRef.current
        if (!start || !current) return [] as Array<{ iso: string; roomId: "A" | "B" }>
        const minRow = Math.min(start.row, current.row)
        const maxRow = Math.max(start.row, current.row)
        const minCol = Math.min(start.gridCol, current.gridCol)
        const maxCol = Math.max(start.gridCol, current.gridCol)
        const results: Array<{ iso: string; roomId: "A" | "B" }> = []
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const dayIndex = Math.floor(col / 2)
                const roomId: "A" | "B" = col % 2 === 0 ? "A" : "B"
                const day = daysRef.current[dayIndex]
                const slot = timeSlotsRef.current[row]
                if (!day || !slot) continue
                if (day.getMonth() !== month - 1 || day.getFullYear() !== year) continue
                const iso = getCellIso(day, slot.hour, slot.minute)
                if (!isBooked(iso, roomId)) {
                    results.push({ iso, roomId })
                }
            }
        }
        return results
    }, [isBooked, month, year])

    const commitPaint = React.useCallback(() => {
        if (!isPaintingRef.current) return
        isPaintingRef.current = false
        const cells = getRectCells()
        if (cells.length === 0) {
            startCellRef.current = null
            currentCellRef.current = null
            rerender()
            return
        }
        const paintType = paintTypeRef.current
        const nextSlots = new Set(draftSlotsRef.current)
        const nextTypes = new Map(draftTypesRef.current)
        const nextRooms = new Map(draftRoomsRef.current)
        for (const { iso, roomId } of cells) {
            if (paintType === "draft") {
                if (isBlockedBySupport(iso, roomId, selectedLessonType)) continue
                nextSlots.add(iso)
                nextTypes.set(iso, selectedLessonType)
                nextRooms.set(iso, roomId)
            } else {
                nextSlots.delete(iso)
                nextTypes.delete(iso)
                nextRooms.delete(iso)
            }
        }
        setDraftSlots(nextSlots)
        setDraftTypes(nextTypes)
        setDraftRooms(nextRooms)
        startCellRef.current = null
        currentCellRef.current = null
        rerender()
    }, [getRectCells, isBlockedBySupport, selectedLessonType])

    const handleCellStart = React.useCallback((row: number, gridCol: number) => {
        if (readOnly) return
        const dayIndex = Math.floor(gridCol / 2)
        const roomId: "A" | "B" = gridCol % 2 === 0 ? "A" : "B"
        const day = daysRef.current[dayIndex]
        const slot = timeSlotsRef.current[row]
        if (!day || !slot) return
        const iso = getCellIso(day, slot.hour, slot.minute)
        if (isBooked(iso, roomId)) return
        const hasDraftInCurrentRoom = draftSlotsRef.current.has(iso) && (draftRoomsRef.current.get(iso) || "A") === roomId
        if (!hasDraftInCurrentRoom && isBlockedBySupport(iso, roomId, selectedLessonType)) return
        isPaintingRef.current = true
        paintTypeRef.current = hasDraftInCurrentRoom ? "neutral" : "draft"
        startCellRef.current = { row, gridCol }
        currentCellRef.current = { row, gridCol }
        rerender()
    }, [isBooked, isBlockedBySupport, readOnly, selectedLessonType])

    const updateCurrentCell = React.useCallback((row: number, gridCol: number) => {
        if (!isPaintingRef.current || readOnly) return
        const current = currentCellRef.current
        if (current && current.row === row && current.gridCol === gridCol) return
        currentCellRef.current = { row, gridCol }
        rerender()
    }, [readOnly])

    React.useEffect(() => {
        const handler = () => commitPaint()
        window.addEventListener("mouseup", handler)
        window.addEventListener("touchend", handler)
        window.addEventListener("touchcancel", handler)
        return () => {
            window.removeEventListener("mouseup", handler)
            window.removeEventListener("touchend", handler)
            window.removeEventListener("touchcancel", handler)
        }
    }, [commitPaint])

    React.useEffect(() => {
        const element = gridRef.current
        if (!element) return
        const handler = (event: TouchEvent) => {
            if (!isPaintingRef.current) return
            event.preventDefault()
            const touch = event.touches[0]
            const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
            const cell = target?.closest<HTMLElement>("[data-row]")
            if (!cell) return
            const row = Number.parseInt(cell.dataset.row || "", 10)
            const gridCol = Number.parseInt(cell.dataset.gridCol || "", 10)
            if (!Number.isNaN(row) && !Number.isNaN(gridCol)) {
                updateCurrentCell(row, gridCol)
            }
        }
        element.addEventListener("touchmove", handler, { passive: false })
        return () => element.removeEventListener("touchmove", handler)
    }, [updateCurrentCell])


    const draftLessons = React.useMemo(() => {
        return Array.from(draftSlots).map((iso) => {
            const startTime = new Date(iso)
            return {
                startTime,
                endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
                roomId: draftRooms.get(iso) || "A",
                type: draftTypes.get(iso) || "REGULAR",
            }
        })
    }, [draftRooms, draftSlots, draftTypes])

    React.useEffect(() => {
        if (lastSyncKeyForDraftRef.current !== editableSyncKey) {
            lastSyncKeyForDraftRef.current = editableSyncKey
            return
        }
        onDraftChange?.(draftLessons)
    }, [draftLessons, editableSyncKey, onDraftChange])

    const clearRangeDrafts = React.useCallback((rangeStart: Date, rangeEnd: Date, label: string) => {
        if (readOnly) return
        if (!window.confirm(`${studentName}の${label}レッスンをすべて削除しますか？`)) return

        setDraftSlots((prev) => {
            const next = new Set<string>()
            for (const iso of prev) {
                const time = new Date(iso).getTime()
                if (Number.isNaN(time)) continue
                if (time >= rangeStart.getTime() && time < rangeEnd.getTime()) continue
                next.add(iso)
            }
            return next
        })
        setDraftTypes((prev) => {
            const next = new Map(prev)
            for (const [iso] of prev) {
                const time = new Date(iso).getTime()
                if (Number.isNaN(time)) continue
                if (time >= rangeStart.getTime() && time < rangeEnd.getTime()) {
                    next.delete(iso)
                }
            }
            return next
        })
        setDraftRooms((prev) => {
            const next = new Map(prev)
            for (const [iso] of prev) {
                const time = new Date(iso).getTime()
                if (Number.isNaN(time)) continue
                if (time >= rangeStart.getTime() && time < rangeEnd.getTime()) {
                    next.delete(iso)
                }
            }
            return next
        })
    }, [readOnly, studentName])

    const handleClearCurrentWeek = React.useCallback(() => {
        const start = startOfDay(days[0])
        const end = addDays(start, 7)
        clearRangeDrafts(start, end, "この1週間の")
    }, [clearRangeDrafts, days])

    const handleClearMonth = React.useCallback(() => {
        const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
        const end = new Date(year, month, 1, 0, 0, 0, 0)
        clearRangeDrafts(start, end, `${year}年${month}月の`)
    }, [clearRangeDrafts, month, year])

    const handleReplicateWeekToOtherWeeks = React.useCallback(() => {
        if (readOnly) return

        const sourceWeekStart = startOfDay(days[0])
        const sourceWeekEnd = addDays(sourceWeekStart, 7)
        const monthStartAt = new Date(year, month - 1, 1, 0, 0, 0, 0)
        const monthEndAt = new Date(year, month, 1, 0, 0, 0, 0)
        const sourceLessons = Array.from(draftSlotsRef.current)
            .filter((iso) => {
                const date = new Date(iso)
                const time = date.getTime()
                if (Number.isNaN(time)) return false
                return time >= sourceWeekStart.getTime() && time < sourceWeekEnd.getTime()
            })
            .map((iso) => ({
                iso,
                roomId: (draftRoomsRef.current.get(iso) || "A") as "A" | "B",
                type: (draftTypesRef.current.get(iso) || "REGULAR") as DraftLessonType,
            }))

        if (sourceLessons.length === 0) {
            toast.info("この週に複製元となるレッスンがありません。")
            return
        }

        if (!window.confirm(`${studentName}のこの週の配置を、この月の他の週にも配置しますか？`)) return

        const nextSlots = new Set(draftSlotsRef.current)
        const nextTypes = new Map(draftTypesRef.current)
        const nextRooms = new Map(draftRoomsRef.current)
        let addedCount = 0
        let skippedDuplicate = 0
        let skippedBooked = 0
        let skippedSupport = 0

        const tryAdd = (target: Date, roomId: "A" | "B", type: DraftLessonType) => {
            const targetMs = target.getTime()
            if (Number.isNaN(targetMs)) return
            if (targetMs < monthStartAt.getTime() || targetMs >= monthEndAt.getTime()) return
            const targetIso = target.toISOString()
            if (nextSlots.has(targetIso)) {
                skippedDuplicate += 1
                return
            }
            if (isBooked(targetIso, roomId)) {
                skippedBooked += 1
                return
            }
            if (isBlockedBySupport(targetIso, roomId, type)) {
                skippedSupport += 1
                return
            }
            nextSlots.add(targetIso)
            nextTypes.set(targetIso, type)
            nextRooms.set(targetIso, roomId)
            addedCount += 1
        }

        for (const source of sourceLessons) {
            const sourceDate = new Date(source.iso)
            if (Number.isNaN(sourceDate.getTime())) continue

            for (
                let forward = addDays(sourceDate, 7);
                forward.getTime() < monthEndAt.getTime();
                forward = addDays(forward, 7)
            ) {
                tryAdd(forward, source.roomId, source.type)
            }
            for (
                let backward = addDays(sourceDate, -7);
                backward.getTime() >= monthStartAt.getTime();
                backward = addDays(backward, -7)
            ) {
                tryAdd(backward, source.roomId, source.type)
            }
        }

        if (addedCount === 0) {
            toast.info("他週へ複製できるコマがありませんでした。")
            return
        }

        setDraftSlots(nextSlots)
        setDraftTypes(nextTypes)
        setDraftRooms(nextRooms)
        toast.success(`他週へ${addedCount}件配置しました（重複${skippedDuplicate} / 予約済み${skippedBooked} / サポート不在${skippedSupport}）。`)
    }, [days, isBlockedBySupport, isBooked, month, readOnly, studentName, toast, year])

    const handleSave = async () => {
        if (!onSave) return
        setIsSaving(true)
        try {
            await onSave(draftLessons)
        } finally {
            setIsSaving(false)
        }
    }

    const navigateWeek = (direction: "prev" | "next") => {
        setWeekStart((prev) => addDays(prev, direction === "next" ? 7 : -7))
    }

    const getVisualState = (iso: string, row: number, gridCol: number, roomId: "A" | "B") => {
        if (isBooked(iso, roomId)) return `booked:${nonEditableTypeByRoomIso.get(`${roomId}:${iso}`) || "REGULAR"}`
        if (isInPendingRect(row, gridCol)) {
            if (paintTypeRef.current === "draft") return `draft:${selectedLessonType}`
            if (availableSet.has(iso)) return "available"
            if (unavailableSet.has(iso)) return "unavailable"
            return "neutral"
        }
        return getSlotStatus(iso, roomId)
    }

    return (
        <div className={cn("flex h-full flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek("prev")}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold">
                        {studentName} | {format(days[0], "M/d", { locale: ja })} - {format(days[6], "M/d", { locale: ja })}
                    </span>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek("next")}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {!readOnly && (
                        <>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={handleClearCurrentWeek}>
                                この週を削除
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={handleReplicateWeekToOtherWeeks}>
                                <Copy className="mr-1 h-3 w-3" />
                                この週を他の週にも配置
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={handleClearMonth}>
                                この月を削除
                            </Button>
                        </>
                    )}
                    <div className="flex items-center gap-2 rounded border bg-white px-2 py-1">
                        <span className="text-slate-500">種別</span>
                        <select
                            value={selectedLessonType}
                            onChange={(event) =>
                                setSelectedLessonType(event.target.value as "REGULAR" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL")
                            }
                            className="h-6 rounded border px-1 text-[11px]"
                            disabled={readOnly}
                        >
                            <option value="REGULAR">通常</option>
                            <option value="PRACTICE">自主練</option>
                            <option value="SOLO_ADDITIONAL">ソロ</option>
                            <option value="DUET_ADDITIONAL">連弾</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded bg-green-200 border border-green-400" />希望</div>
                    <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded bg-red-200 border border-red-400" />不可</div>
                    <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded bg-slate-200 border border-slate-400" />RoomB不在</div>
                    <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded bg-slate-400" />予約済</div>
                    {!readOnly && (
                        <div className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                            <PenLine className="h-2.5 w-2.5" />ドラッグ
                        </div>
                    )}
                </div>
            </div>

            <div
                ref={gridRef}
                className="min-h-[780px] max-h-[calc(100vh-220px)] overflow-auto rounded-lg border border-slate-200 bg-white select-none"
                onMouseLeave={() => commitPaint()}
            >
                <table className="w-full min-w-[1180px] border-collapse text-center text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-slate-500">
                        <tr>
                            <th className="sticky left-0 z-30 w-12 border-r border-slate-200 bg-slate-50 px-1 py-1.5 text-[10px] font-medium">時間</th>
                            {days.map((day) => {
                                const inMonth = isDayInMonth(day)
                                const isSun = day.getDay() === 0
                                const isSat = day.getDay() === 6
                                return (
                                    <th
                                        key={day.toISOString()}
                                        className={cn("min-w-[136px] border-r border-slate-200 px-0 py-1 font-medium last:border-r-0", !inMonth && "opacity-35")}
                                    >
                                        <div className="flex flex-col items-center leading-tight">
                                            <span className={cn("text-[10px]", isSun && "text-red-500", isSat && "text-blue-500")}>
                                                {format(day, "E", { locale: ja })}
                                            </span>
                                            <span className={cn("text-sm font-bold", inMonth ? "text-slate-900" : "text-slate-400", isSun && inMonth && "text-red-600", isSat && inMonth && "text-blue-600")}>
                                                {format(day, "d")}
                                            </span>
                                            <div className="mt-0.5 grid w-full grid-cols-2 gap-[1px] px-1 text-[9px]">
                                                <span className="rounded bg-blue-50 py-0.5 font-semibold text-blue-700">A</span>
                                                <span className="rounded bg-emerald-50 py-0.5 font-semibold text-emerald-700">B</span>
                                            </div>
                                        </div>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {timeSlots.map(({ hour, minute, label }, rowIndex) => (
                            <tr key={`${hour}-${minute}`} className={cn(minute === 0 && rowIndex > 0 && "border-t border-slate-200")}>
                                <td className={cn("sticky left-0 z-10 w-12 border-r border-slate-200 bg-white px-1 py-0 text-[10px] font-medium text-slate-400", minute === 30 && "text-slate-300")}>
                                    {minute === 0 ? label : ""}
                                </td>
                                {days.map((day, colIndex) => {
                                    const iso = getCellIso(day, hour, minute)
                                    const inMonth = isDayInMonth(day)
                                    return (
                                        <td key={day.toISOString()} className={cn("border-r p-0 last:border-r-0", minute === 0 ? "border-t border-slate-200" : "border-t border-slate-100")}>
                                            <div className={cn("grid h-[44px] grid-cols-2 gap-[1px] bg-slate-100 p-[1px]", !inMonth && "opacity-35")}>
                                                {(["A", "B"] as const).map((roomId, roomOffset) => {
                                                    const gridCol = colIndex * 2 + roomOffset
                                                    const visual = getVisualState(iso, rowIndex, gridCol, roomId)
                                                    const isNoSupport = visual === "no_support"
                                                    const bookedStudent = nonEditableStudentByRoomIso.get(`${roomId}:${iso}`)
                                                    const color = visual.startsWith("booked:")
                                                        ? getStudentColorClasses(bookedStudent?.studentId)
                                                        : visual.startsWith("draft:")
                                                            ? getStudentColorClasses(studentId)
                                                            : null
                                                    return (
                                                        <div
                                                            key={`${day.toISOString()}-${roomId}`}
                                                            data-row={rowIndex}
                                                            data-grid-col={gridCol}
                                                            onMouseDown={(event) => {
                                                                if (event.button === 0 && inMonth && !readOnly) handleCellStart(rowIndex, gridCol)
                                                            }}
                                                            onMouseEnter={() => {
                                                                if (inMonth && !readOnly) updateCurrentCell(rowIndex, gridCol)
                                                            }}
                                                            onTouchStart={() => {
                                                                if (inMonth && !readOnly) handleCellStart(rowIndex, gridCol)
                                                            }}
                                                            className={cn(
                                                                "flex h-full w-full items-center justify-center rounded-[2px] border border-slate-200 transition-colors duration-75",
                                                                inMonth && visual.startsWith("booked:") && color && `cursor-not-allowed ${color.bg} ${color.border} ${color.text}`,
                                                                inMonth && visual.startsWith("draft:") && color && `${readOnly ? "cursor-default" : "cursor-pointer"} ${color.bg} ${color.border} ${color.text}`,
                                                                inMonth && visual === "available" && `${readOnly ? "cursor-default" : "cursor-pointer"} bg-green-100`,
                                                                inMonth && visual === "unavailable" && `${readOnly ? "cursor-default" : "cursor-pointer"} bg-red-100`,
                                                                inMonth && visual === "neutral" && !readOnly && "cursor-pointer bg-white hover:bg-slate-50",
                                                                inMonth && visual === "neutral" && readOnly && "bg-white",
                                                                inMonth && isNoSupport && "bg-slate-100 border-dashed border-slate-300"
                                                            )}
                                                            title={
                                                                visual.startsWith("booked:")
                                                                    ? bookedStudent?.studentName || "名前未設定"
                                                                    : visual.startsWith("draft:")
                                                                        ? studentName
                                                                        : undefined
                                                            }
                                                        >
                                                            {inMonth && visual.startsWith("booked:") && (
                                                                <span className="w-full truncate px-1 text-center text-[9px] font-bold">
                                                                    {bookedStudent?.studentName || "名前未設定"}
                                                                </span>
                                                            )}
                                                            {inMonth && visual.startsWith("draft:") && (
                                                                <span className="w-full truncate px-1 text-center text-[9px] font-bold">
                                                                    {studentName}
                                                                </span>
                                                            )}
                                                            {inMonth && visual === "available" && <span className="text-[9px] font-medium text-green-600">◯</span>}
                                                            {inMonth && visual === "unavailable" && <span className="text-[9px] text-red-400">✕</span>}
                                                            {inMonth && isNoSupport && <span className="rounded bg-slate-200 px-1 text-[9px] text-slate-600">自主練</span>}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showSaveControls && onSave && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">{draftSlots.size}件のレッスンを保存予定</div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDraftSlots(new Set())
                                setDraftTypes(new Map())
                                setDraftRooms(new Map())
                            }}
                            disabled={readOnly}
                        >
                            全削除
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving || readOnly}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            保存
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
