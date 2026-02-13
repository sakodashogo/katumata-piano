"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { format, addDays, startOfWeek, setHours, setMinutes, startOfDay } from "date-fns"
import { ja } from "date-fns/locale"
import { Loader2, ChevronLeft, ChevronRight, PenLine } from "lucide-react"

type Lesson = {
    id: string
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

type CellPos = { row: number; col: number }

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

    const [draftSlots, setDraftSlots] = React.useState<Set<string>>(new Set(Array.from(editableLessonsByIso.keys())))
    const [draftTypes, setDraftTypes] = React.useState<Map<string, "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">>(new Map(editableLessonsByIso))
    const [draftRooms, setDraftRooms] = React.useState<Map<string, "A" | "B">>(new Map(editableRoomByIso))
    const [selectedRoomId, setSelectedRoomId] = React.useState<"A" | "B">("A")
    const [selectedLessonType, setSelectedLessonType] = React.useState<"REGULAR" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">("REGULAR")

    React.useEffect(() => {
        setDraftSlots(new Set(Array.from(editableLessonsByIso.keys())))
        setDraftTypes(new Map(editableLessonsByIso))
        setDraftRooms(new Map(editableRoomByIso))
    }, [editableLessonsByIso, editableRoomByIso, studentId])

    React.useEffect(() => {
        const firstEditable = existingLessons.find((lesson) => lesson.isEditable && (lesson.roomId === "A" || lesson.roomId === "B"))
        if (firstEditable?.roomId === "B") {
            setSelectedRoomId("B")
        } else {
            setSelectedRoomId("A")
        }
    }, [existingLessons, studentId])

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
    const draftSlotsRef = React.useRef(draftSlots)
    draftSlotsRef.current = draftSlots
    const draftTypesRef = React.useRef(draftTypes)
    draftTypesRef.current = draftTypes
    const draftRoomsRef = React.useRef(draftRooms)
    draftRoomsRef.current = draftRooms

    const getCellIso = (day: Date, hour: number, minute: number) =>
        setMinutes(setHours(startOfDay(day), hour), minute).toISOString()

    const isBooked = React.useCallback(
        (iso: string) => nonEditableByRoom.get(selectedRoomId)?.has(new Date(iso).getTime()) ?? false,
        [nonEditableByRoom, selectedRoomId]
    )

    const hasSupportAt = React.useCallback((iso: string) => {
        const start = new Date(iso)
        const end = new Date(start.getTime() + 30 * 60 * 1000)
        return parsedSupportShifts.some((shift) => shift.startTime < end && shift.endTime > start)
    }, [parsedSupportShifts])

    const isBlockedBySupport = React.useCallback((iso: string) => {
        if (selectedRoomId !== "B") return false
        if (selectedLessonType === "PRACTICE") return false
        return !hasSupportAt(iso)
    }, [hasSupportAt, selectedLessonType, selectedRoomId])

    const isDayInMonth = (day: Date) => day.getMonth() === month - 1 && day.getFullYear() === year

    const getSlotStatus = (iso: string): string => {
        if (isBooked(iso)) return `booked:${nonEditableTypeByRoomIso.get(`${selectedRoomId}:${iso}`) || "REGULAR"}`
        if (draftSlots.has(iso) && (draftRooms.get(iso) || "A") === selectedRoomId) {
            return `draft:${draftTypes.get(iso) || "REGULAR"}`
        }
        if (isBlockedBySupport(iso)) return "no_support"
        if (availableSet.has(iso)) return "available"
        if (unavailableSet.has(iso)) return "unavailable"
        return "neutral"
    }

    const isInPendingRect = (row: number, col: number) => {
        const start = startCellRef.current
        const current = currentCellRef.current
        if (!start || !current || !isPaintingRef.current) return false
        const minRow = Math.min(start.row, current.row)
        const maxRow = Math.max(start.row, current.row)
        const minCol = Math.min(start.col, current.col)
        const maxCol = Math.max(start.col, current.col)
        return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
    }

    const getRectIsos = React.useCallback(() => {
        const start = startCellRef.current
        const current = currentCellRef.current
        if (!start || !current) return []
        const minRow = Math.min(start.row, current.row)
        const maxRow = Math.max(start.row, current.row)
        const minCol = Math.min(start.col, current.col)
        const maxCol = Math.max(start.col, current.col)
        const results: string[] = []
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const day = daysRef.current[col]
                const slot = timeSlotsRef.current[row]
                if (!day || !slot) continue
                if (day.getMonth() !== month - 1 || day.getFullYear() !== year) continue
                const iso = getCellIso(day, slot.hour, slot.minute)
                if (!isBooked(iso)) {
                    results.push(iso)
                }
            }
        }
        return results
    }, [isBooked, month, year])

    const commitPaint = React.useCallback(() => {
        if (!isPaintingRef.current) return
        isPaintingRef.current = false
        const isos = getRectIsos()
        if (isos.length === 0) {
            startCellRef.current = null
            currentCellRef.current = null
            rerender()
            return
        }
        const paintType = paintTypeRef.current
        const nextSlots = new Set(draftSlotsRef.current)
        const nextTypes = new Map(draftTypesRef.current)
        const nextRooms = new Map(draftRoomsRef.current)
        for (const iso of isos) {
            if (paintType === "draft") {
                if (isBlockedBySupport(iso)) continue
                nextSlots.add(iso)
                nextTypes.set(iso, selectedLessonType)
                nextRooms.set(iso, selectedRoomId)
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
    }, [getRectIsos, isBlockedBySupport, selectedLessonType, selectedRoomId])

    const handleCellStart = React.useCallback((row: number, col: number) => {
        if (readOnly) return
        const day = daysRef.current[col]
        const slot = timeSlotsRef.current[row]
        if (!day || !slot) return
        const iso = getCellIso(day, slot.hour, slot.minute)
        if (isBooked(iso)) return
        const hasDraftInCurrentRoom = draftSlotsRef.current.has(iso) && (draftRoomsRef.current.get(iso) || "A") === selectedRoomId
        if (!hasDraftInCurrentRoom && isBlockedBySupport(iso)) return
        isPaintingRef.current = true
        paintTypeRef.current = hasDraftInCurrentRoom ? "neutral" : "draft"
        startCellRef.current = { row, col }
        currentCellRef.current = { row, col }
        rerender()
    }, [isBooked, isBlockedBySupport, readOnly, selectedRoomId])

    const updateCurrentCell = React.useCallback((row: number, col: number) => {
        if (!isPaintingRef.current || readOnly) return
        const current = currentCellRef.current
        if (current && current.row === row && current.col === col) return
        currentCellRef.current = { row, col }
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
            const col = Number.parseInt(cell.dataset.col || "", 10)
            if (!Number.isNaN(row) && !Number.isNaN(col)) {
                updateCurrentCell(row, col)
            }
        }
        element.addEventListener("touchmove", handler, { passive: false })
        return () => element.removeEventListener("touchmove", handler)
    }, [updateCurrentCell])

    const storageKey = React.useMemo(() => `monthly-planner:${studentId}:${year}-${month}`, [studentId, year, month])

    React.useEffect(() => {
        if (typeof window === "undefined") return
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return
        try {
            const parsed = JSON.parse(raw) as {
                slots?: string[]
                types?: Array<[string, "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"]>
                rooms?: Array<[string, "A" | "B"]>
                roomId?: "A" | "B"
            }
            if (Array.isArray(parsed.slots)) setDraftSlots(new Set(parsed.slots))
            if (Array.isArray(parsed.types)) setDraftTypes(new Map(parsed.types))
            if (Array.isArray(parsed.rooms)) setDraftRooms(new Map(parsed.rooms))
            if (parsed.roomId === "A" || parsed.roomId === "B") setSelectedRoomId(parsed.roomId)
        } catch {
            // ignore
        }
    }, [storageKey, studentId])

    React.useEffect(() => {
        if (typeof window === "undefined") return
        const payload = JSON.stringify({
            slots: Array.from(draftSlots),
            types: Array.from(draftTypes.entries()),
            rooms: Array.from(draftRooms.entries()),
            roomId: selectedRoomId,
        })
        window.localStorage.setItem(storageKey, payload)
    }, [draftRooms, draftSlots, draftTypes, selectedRoomId, storageKey])

    const draftLessons = React.useMemo(() => {
        return Array.from(draftSlots).map((iso) => {
            const startTime = new Date(iso)
            return {
                startTime,
                endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
                roomId: draftRooms.get(iso) || selectedRoomId,
                type: draftTypes.get(iso) || "REGULAR",
            }
        })
    }, [draftRooms, draftSlots, draftTypes, selectedRoomId])

    React.useEffect(() => {
        onDraftChange?.(draftLessons)
    }, [draftLessons, onDraftChange])

    const handleSave = async () => {
        if (!onSave) return
        setIsSaving(true)
        try {
            const success = await onSave(draftLessons)
            if (success && typeof window !== "undefined") {
                window.localStorage.removeItem(storageKey)
            }
        } finally {
            setIsSaving(false)
        }
    }

    const navigateWeek = (direction: "prev" | "next") => {
        setWeekStart((prev) => addDays(prev, direction === "next" ? 7 : -7))
    }

    const getVisualState = (iso: string, row: number, col: number) => {
        if (isBooked(iso)) return `booked:${nonEditableTypeByRoomIso.get(`${selectedRoomId}:${iso}`) || "REGULAR"}`
        if (isInPendingRect(row, col)) {
            if (paintTypeRef.current === "draft") return `draft:${selectedLessonType}`
            if (availableSet.has(iso)) return "available"
            if (unavailableSet.has(iso)) return "unavailable"
            return "neutral"
        }
        return getSlotStatus(iso)
    }

    const typeColor = (type: string) => {
        if (type === "PRACTICE") return "bg-slate-500 text-white"
        if (type === "SOLO_ADDITIONAL") return "bg-indigo-500 text-white"
        if (type === "DUET_ADDITIONAL") return "bg-rose-500 text-white"
        if (type === "AD_HOC") return "bg-amber-500 text-white"
        return "bg-blue-500 text-white"
    }

    const typeShort = (type: string) => {
        if (type === "PRACTICE") return "自"
        if (type === "SOLO_ADDITIONAL") return "ソ"
        if (type === "DUET_ADDITIONAL") return "連"
        if (type === "AD_HOC") return "追"
        return "通"
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
                    <div className="flex items-center gap-2 rounded border bg-white px-2 py-1">
                        <span className="text-slate-500">教室</span>
                        <select
                            value={selectedRoomId}
                            onChange={(event) => setSelectedRoomId(event.target.value === "B" ? "B" : "A")}
                            className="h-6 rounded border px-1 text-[11px]"
                            disabled={readOnly}
                        >
                            <option value="A">第1</option>
                            <option value="B">第2</option>
                        </select>
                    </div>
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
                className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white select-none"
                onMouseLeave={() => commitPaint()}
            >
                <table className="w-full min-w-[980px] border-collapse text-center text-sm">
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
                                        className={cn("min-w-[62px] border-r border-slate-200 px-0 py-1 font-medium last:border-r-0", !inMonth && "opacity-35")}
                                    >
                                        <div className="flex flex-col items-center leading-tight">
                                            <span className={cn("text-[10px]", isSun && "text-red-500", isSat && "text-blue-500")}>
                                                {format(day, "E", { locale: ja })}
                                            </span>
                                            <span className={cn("text-sm font-bold", inMonth ? "text-slate-900" : "text-slate-400", isSun && inMonth && "text-red-600", isSat && inMonth && "text-blue-600")}>
                                                {format(day, "d")}
                                            </span>
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
                                    const visual = getVisualState(iso, rowIndex, colIndex)
                                    const isNoSupport = visual === "no_support"
                                    return (
                                        <td key={day.toISOString()} className={cn("border-r p-0 last:border-r-0", minute === 0 ? "border-t border-slate-200" : "border-t border-slate-100")}>
                                            <div
                                                data-row={rowIndex}
                                                data-col={colIndex}
                                                onMouseDown={(event) => {
                                                    if (event.button === 0 && inMonth && !readOnly) handleCellStart(rowIndex, colIndex)
                                                }}
                                                onMouseEnter={() => {
                                                    if (inMonth && !readOnly) updateCurrentCell(rowIndex, colIndex)
                                                }}
                                                onTouchStart={() => {
                                                    if (inMonth && !readOnly) handleCellStart(rowIndex, colIndex)
                                                }}
                                                className={cn(
                                                    "flex h-[34px] w-full items-center justify-center transition-colors duration-75",
                                                    !inMonth && "bg-slate-50 opacity-30",
                                                    inMonth && visual.startsWith("booked:") && "cursor-not-allowed bg-slate-400 text-white",
                                                    inMonth && visual.startsWith("draft:") && `${readOnly ? "cursor-default" : "cursor-pointer"} ${typeColor(visual.split(":")[1] || "REGULAR")}`,
                                                    inMonth && visual === "available" && `${readOnly ? "cursor-default" : "cursor-pointer"} bg-green-100`,
                                                    inMonth && visual === "unavailable" && `${readOnly ? "cursor-default" : "cursor-pointer"} bg-red-100`,
                                                    inMonth && visual === "neutral" && !readOnly && "cursor-pointer hover:bg-slate-50",
                                                    inMonth && isNoSupport && "bg-slate-100 border border-dashed border-slate-300"
                                                )}
                                            >
                                                {inMonth && visual.startsWith("booked:") && <span className="text-[9px] font-bold">済</span>}
                                                {inMonth && visual.startsWith("draft:") && <span className="text-[9px] font-bold">{typeShort(visual.split(":")[1] || "REGULAR")}</span>}
                                                {inMonth && visual === "available" && <span className="text-[9px] font-medium text-green-600">◯</span>}
                                                {inMonth && visual === "unavailable" && <span className="text-[9px] text-red-400">✕</span>}
                                                {inMonth && isNoSupport && <span className="rounded bg-slate-200 px-1 text-[9px] text-slate-600">自主練のみ</span>}
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
