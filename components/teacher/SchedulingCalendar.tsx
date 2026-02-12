"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    format,
    addDays,
    startOfWeek,
    setHours,
    setMinutes,
    startOfDay,
} from "date-fns"
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

type Props = {
    studentId: string
    studentName: string
    availableSlots: string[]
    unavailableSlots: string[]
    existingLessons: Lesson[]
    year: number
    month: number
    onSave: (lessons: {
        startTime: Date
        endTime: Date
        roomId: string
        type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
    }[]) => Promise<boolean>
    isOpen: boolean
    onClose: () => void
}

const START_HOUR = 9
const END_HOUR = 22

type CellPos = { row: number; col: number }

export function SchedulingCalendar({
    studentId,
    studentName,
    availableSlots,
    unavailableSlots,
    existingLessons,
    year,
    month,
    onSave,
    isOpen,
    onClose
}: Props) {
    const monthStart = new Date(year, month - 1, 1)

    const [weekStart, setWeekStart] = React.useState(() =>
        startOfWeek(monthStart, { weekStartsOn: 1 })
    )

    React.useEffect(() => {
        setWeekStart(startOfWeek(new Date(year, month - 1, 1), { weekStartsOn: 1 }))
    }, [year, month, isOpen])

    const days = React.useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    )

    const timeSlots = React.useMemo(() => {
        const slots: { hour: number; minute: number; label: string }[] = []
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            slots.push({ hour: h, minute: 0, label: `${h}:00` })
            if (h < END_HOUR) {
                slots.push({ hour: h, minute: 30, label: `${h}:30` })
            }
        }
        return slots
    }, [])

    const availableSet = React.useMemo(() => new Set(availableSlots), [availableSlots])
    const unavailableSet = React.useMemo(() => new Set(unavailableSlots), [unavailableSlots])

    const nonEditableByRoom = React.useMemo(() => {
        const set = new Map<string, Set<number>>()
        set.set("A", new Set())
        set.set("B", new Set())
        existingLessons
            .filter((lesson) => !lesson.isEditable)
            .forEach((lesson) => {
                const roomId = lesson.roomId === "B" ? "B" : "A"
                const ts = new Date(lesson.startTime).getTime()
                set.get(roomId)?.add(ts)
            })
        return set
    }, [existingLessons])

    const nonEditableTypeByRoomIso = React.useMemo(() => {
        const map = new Map<string, string>()
        existingLessons
            .filter((lesson) => !lesson.isEditable)
            .forEach((lesson) => {
                const roomId = lesson.roomId === "B" ? "B" : "A"
                const iso = new Date(lesson.startTime).toISOString()
                map.set(`${roomId}:${iso}`, lesson.type || "REGULAR")
            })
        return map
    }, [existingLessons])

    const editableLessonsByIso = React.useMemo(() => {
        const map = new Map<string, "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">()
        existingLessons
            .filter((lesson) => !!lesson.isEditable)
            .forEach((lesson) => {
                const start = new Date(lesson.startTime)
                if (!Number.isNaN(start.getTime())) {
                    map.set(
                        start.toISOString(),
                        (lesson.type as "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL") || "REGULAR"
                    )
                }
            })
        return map
    }, [existingLessons])

    const editableRoomByIso = React.useMemo(() => {
        const map = new Map<string, "A" | "B">()
        existingLessons
            .filter((lesson) => !!lesson.isEditable)
            .forEach((lesson) => {
                const iso = new Date(lesson.startTime).toISOString()
                map.set(iso, lesson.roomId === "B" ? "B" : "A")
            })
        return map
    }, [existingLessons])

    const [draftSlots, setDraftSlots] = React.useState<Set<string>>(new Set(Array.from(editableLessonsByIso.keys())))
    const [draftTypes, setDraftTypes] = React.useState<Map<string, "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">>(
        new Map(editableLessonsByIso)
    )
    const [draftRooms, setDraftRooms] = React.useState<Map<string, "A" | "B">>(new Map(editableRoomByIso))
    const [selectedRoomId, setSelectedRoomId] = React.useState<"A" | "B">("A")
    const [selectedLessonType, setSelectedLessonType] = React.useState<"REGULAR" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">("REGULAR")
    const [isSaving, setIsSaving] = React.useState(false)
    const storageKey = React.useMemo(
        () => `monthly-planner:${studentId}:${year}-${month}`,
        [studentId, year, month]
    )

    React.useEffect(() => {
        setDraftSlots(new Set(Array.from(editableLessonsByIso.keys())))
        setDraftTypes(new Map(editableLessonsByIso))
        setDraftRooms(new Map(editableRoomByIso))
    }, [editableLessonsByIso, editableRoomByIso, isOpen])

    React.useEffect(() => {
        const firstEditable = existingLessons.find((lesson) => lesson.isEditable && (lesson.roomId === "A" || lesson.roomId === "B"))
        if (firstEditable?.roomId === "B") {
            setSelectedRoomId("B")
            return
        }
        setSelectedRoomId("A")
    }, [existingLessons, isOpen])

    // --- Rectangle-based drag state ---
    const isPaintingRef = React.useRef(false)
    const paintTypeRef = React.useRef<'draft' | 'neutral'>('draft')
    const startCellRef = React.useRef<CellPos | null>(null)
    const currentCellRef = React.useRef<CellPos | null>(null)
    const [, forceRender] = React.useState(0)
    const rerender = () => forceRender(c => c + 1)

    const gridRef = React.useRef<HTMLDivElement>(null)

    // Keep refs to latest values for event handlers
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

    const isDayInMonth = (day: Date) =>
        day.getMonth() === month - 1 && day.getFullYear() === year

    const getSlotStatus = (iso: string): string => {
        if (isBooked(iso)) return `booked:${nonEditableTypeByRoomIso.get(`${selectedRoomId}:${iso}`) || "REGULAR"}`
        if (draftSlots.has(iso) && (draftRooms.get(iso) || "A") === selectedRoomId) {
            return `draft:${draftTypes.get(iso) || "REGULAR"}`
        }
        if (availableSet.has(iso)) return 'available'
        if (unavailableSet.has(iso)) return 'unavailable'
        return 'neutral'
    }

    // Check if a cell (row, col) is inside the current drag rectangle
    const isInPendingRect = (row: number, col: number): boolean => {
        const start = startCellRef.current
        const current = currentCellRef.current
        if (!start || !current || !isPaintingRef.current) return false

        const minRow = Math.min(start.row, current.row)
        const maxRow = Math.max(start.row, current.row)
        const minCol = Math.min(start.col, current.col)
        const maxCol = Math.max(start.col, current.col)

        return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
    }

    // Compute all ISOs in the current rectangle (for commit)
    const getRectIsos = React.useCallback((): string[] => {
        const start = startCellRef.current
        const current = currentCellRef.current
        if (!start || !current) return []

        const currentDays = daysRef.current
        const currentTimeSlots = timeSlotsRef.current

        const minRow = Math.min(start.row, current.row)
        const maxRow = Math.max(start.row, current.row)
        const minCol = Math.min(start.col, current.col)
        const maxCol = Math.max(start.col, current.col)

        const result: string[] = []
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const day = currentDays[c]
                if (!day) continue
                const slot = currentTimeSlots[r]
                if (!slot) continue
                if (day.getMonth() === month - 1 && day.getFullYear() === year) {
                    const iso = getCellIso(day, slot.hour, slot.minute)
                    if (!isBooked(iso)) {
                        result.push(iso)
                    }
                }
            }
        }
        return result
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
        isos.forEach((iso) => {
            if (paintType === "draft") {
                nextSlots.add(iso)
                nextTypes.set(iso, selectedLessonType)
                nextRooms.set(iso, selectedRoomId)
            } else {
                nextSlots.delete(iso)
                nextTypes.delete(iso)
                nextRooms.delete(iso)
            }
        })
        setDraftSlots(nextSlots)
        setDraftTypes(nextTypes)
        setDraftRooms(nextRooms)

        startCellRef.current = null
        currentCellRef.current = null
        rerender()
    }, [getRectIsos, selectedLessonType, selectedRoomId])

    const handleCellStart = React.useCallback((row: number, col: number) => {
        const day = daysRef.current[col]
        const slot = timeSlotsRef.current[row]
        if (!day || !slot) return
        const iso = getCellIso(day, slot.hour, slot.minute)
        if (isBooked(iso)) return

        isPaintingRef.current = true
        const hasDraftInCurrentRoom =
            draftSlotsRef.current.has(iso) &&
            (draftRoomsRef.current.get(iso) || "A") === selectedRoomId
        paintTypeRef.current = hasDraftInCurrentRoom ? 'neutral' : 'draft'
        startCellRef.current = { row, col }
        currentCellRef.current = { row, col }
        rerender()
    }, [isBooked, selectedRoomId])

    const updateCurrentCell = React.useCallback((row: number, col: number) => {
        if (!isPaintingRef.current) return
        const current = currentCellRef.current
        if (current && current.row === row && current.col === col) return
        currentCellRef.current = { row, col }
        rerender()
    }, [])

    // Global mouse/touch up
    React.useEffect(() => {
        const handler = () => commitPaint()
        window.addEventListener('mouseup', handler)
        window.addEventListener('touchend', handler)
        window.addEventListener('touchcancel', handler)
        return () => {
            window.removeEventListener('mouseup', handler)
            window.removeEventListener('touchend', handler)
            window.removeEventListener('touchcancel', handler)
        }
    }, [commitPaint])

    // Touch move
    React.useEffect(() => {
        const el = gridRef.current
        if (!el) return
        const handler = (e: TouchEvent) => {
            if (!isPaintingRef.current) return
            e.preventDefault()
            const touch = e.touches[0]
            const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
            const cellEl = target?.closest<HTMLElement>('[data-row]')
            if (cellEl) {
                const row = parseInt(cellEl.dataset.row!, 10)
                const col = parseInt(cellEl.dataset.col!, 10)
                if (!isNaN(row) && !isNaN(col)) {
                    updateCurrentCell(row, col)
                }
            }
        }
        el.addEventListener('touchmove', handler, { passive: false })
        return () => el.removeEventListener('touchmove', handler)
    }, [updateCurrentCell])

    React.useEffect(() => {
        if (!isOpen || typeof window === "undefined") return
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return
        try {
            const parsed = JSON.parse(raw) as {
                slots?: string[]
                types?: Array<[string, "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"]>
                rooms?: Array<[string, "A" | "B"]>
                roomId?: "A" | "B"
            }
            if (Array.isArray(parsed.slots)) {
                setDraftSlots(new Set(parsed.slots))
            }
            if (Array.isArray(parsed.types)) {
                setDraftTypes(new Map(parsed.types))
            }
            if (Array.isArray(parsed.rooms)) {
                setDraftRooms(new Map(parsed.rooms))
            }
            if (parsed.roomId === "A" || parsed.roomId === "B") {
                setSelectedRoomId(parsed.roomId)
            }
        } catch {
            // ignore corrupted local state
        }
    }, [isOpen, storageKey])

    React.useEffect(() => {
        if (!isOpen || typeof window === "undefined") return
        const payload = JSON.stringify({
            slots: Array.from(draftSlots),
            types: Array.from(draftTypes.entries()),
            rooms: Array.from(draftRooms.entries()),
            roomId: selectedRoomId,
        })
        window.localStorage.setItem(storageKey, payload)
    }, [draftSlots, draftTypes, draftRooms, isOpen, selectedRoomId, storageKey])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const lessons = Array.from(draftSlots).map(iso => {
                const start = new Date(iso)
                const end = new Date(start.getTime() + 30 * 60 * 1000)
                return {
                    startTime: start,
                    endTime: end,
                    roomId: draftRooms.get(iso) || selectedRoomId,
                    type: draftTypes.get(iso) || "REGULAR",
                }
            })
            const success = await onSave(lessons)
            if (success) {
                setDraftSlots(new Set())
                setDraftTypes(new Map())
                setDraftRooms(new Map())
                if (typeof window !== "undefined") {
                    window.localStorage.removeItem(storageKey)
                }
                onClose()
            }
        } finally {
            setIsSaving(false)
        }
    }

    const navigateWeek = (direction: 'prev' | 'next') => {
        setWeekStart(prev => addDays(prev, direction === 'next' ? 7 : -7))
    }

    const getVisualState = (iso: string, row: number, col: number) => {
        if (isBooked(iso)) return `booked:${nonEditableTypeByRoomIso.get(`${selectedRoomId}:${iso}`) || "REGULAR"}`
        if (isInPendingRect(row, col)) {
            if (paintTypeRef.current === 'draft') return `draft:${selectedLessonType}`
            // When un-drafting, show underlying state
            if (availableSet.has(iso)) return 'available'
            if (unavailableSet.has(iso)) return 'unavailable'
            return 'neutral'
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
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[96vw] h-[92vh] overflow-hidden flex flex-col p-4 sm:p-6">
                <DialogHeader>
                    <DialogTitle>{studentName} - レッスン作成 ({year}年{month}月)</DialogTitle>
                </DialogHeader>

                {/* Week navigation + legend */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek('prev')}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="font-medium text-sm min-w-[120px] text-center">
                            {format(days[0], "M/d", { locale: ja })} 〜 {format(days[6], "M/d", { locale: ja })}
                        </span>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek('next')}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex items-center text-[11px] gap-2 flex-wrap">
                        <div className="flex items-center gap-2 rounded border bg-white px-2 py-1">
                            <span className="text-slate-500">保存先教室</span>
                            <select
                                value={selectedRoomId}
                                onChange={(e) => setSelectedRoomId(e.target.value === "B" ? "B" : "A")}
                                className="h-6 rounded border px-1 text-[11px]"
                            >
                                <option value="A">第1レッスン室</option>
                                <option value="B">第2レッスン室</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2 rounded border bg-white px-2 py-1">
                            <span className="text-slate-500">追加種別</span>
                            <select
                                value={selectedLessonType}
                                onChange={(e) =>
                                    setSelectedLessonType(
                                        e.target.value as "REGULAR" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
                                    )
                                }
                                className="h-6 rounded border px-1 text-[11px]"
                            >
                                <option value="REGULAR">通常</option>
                                <option value="PRACTICE">自主練</option>
                                <option value="SOLO_ADDITIONAL">ソロ</option>
                                <option value="DUET_ADDITIONAL">連弾</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-green-200 border border-green-400" />希望</div>
                        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-red-200 border border-red-400" />不可</div>
                        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-blue-500" />通常</div>
                        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-slate-500" />自主練</div>
                        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-indigo-500" />ソロ</div>
                        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-rose-500" />連弾</div>
                        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-slate-400" />予約済</div>
                        <div className="flex items-center gap-1 text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            <PenLine className="h-2.5 w-2.5" />ドラッグで範囲選択
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div
                    ref={gridRef}
                    className="overflow-auto flex-1 rounded-lg border border-slate-200 bg-white select-none"
                    onMouseLeave={() => commitPaint()}
                >
                    <table className="w-full min-w-[980px] text-center text-sm border-collapse">
                        <thead className="bg-slate-50 text-slate-500 sticky top-0 z-20">
                            <tr>
                                <th className="w-12 px-1 py-1.5 text-[10px] font-medium sticky left-0 bg-slate-50 z-30 border-r border-slate-200">
                                    時間
                                </th>
                                {days.map(day => {
                                    const inMonth = isDayInMonth(day)
                                    const isSun = day.getDay() === 0
                                    const isSat = day.getDay() === 6
                                    return (
                                        <th
                                            key={day.toISOString()}
                                            className={cn(
                                                "px-0 py-1 font-medium min-w-[62px] border-r border-slate-200 last:border-r-0",
                                                !inMonth && "opacity-35"
                                            )}
                                        >
                                            <div className="flex flex-col items-center leading-tight">
                                                <span className={cn(
                                                    "text-[10px]",
                                                    isSun && "text-red-500",
                                                    isSat && "text-blue-500"
                                                )}>
                                                    {format(day, "E", { locale: ja })}
                                                </span>
                                                <span className={cn(
                                                    "text-sm font-bold",
                                                    inMonth ? "text-slate-900" : "text-slate-400",
                                                    isSun && inMonth && "text-red-600",
                                                    isSat && inMonth && "text-blue-600",
                                                )}>
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
                                <tr
                                    key={`${hour}-${minute}`}
                                    className={cn(
                                        minute === 0 && rowIndex > 0 && "border-t border-slate-200"
                                    )}
                                >
                                    <td className={cn(
                                        "w-12 px-1 py-0 text-[10px] font-medium text-slate-400 sticky left-0 bg-white z-10 border-r border-slate-200",
                                        minute === 30 && "text-slate-300"
                                    )}>
                                        {minute === 0 ? label : ""}
                                    </td>
                                    {days.map((day, colIndex) => {
                                        const iso = getCellIso(day, hour, minute)
                                        const inMonth = isDayInMonth(day)
                                        const visual = getVisualState(iso, rowIndex, colIndex)

                                        return (
                                            <td
                                                key={day.toISOString()}
                                                className={cn(
                                                    "p-0 border-r last:border-r-0",
                                                    minute === 0 ? "border-t border-slate-200" : "border-t border-slate-100"
                                                )}
                                            >
                                                <div
                                                    data-row={rowIndex}
                                                    data-col={colIndex}
                                                    onMouseDown={(e) => {
                                                        if (e.button === 0 && inMonth) handleCellStart(rowIndex, colIndex)
                                                    }}
                                                    onMouseEnter={() => {
                                                        if (inMonth) updateCurrentCell(rowIndex, colIndex)
                                                    }}
                                                    onTouchStart={() => {
                                                        if (inMonth) handleCellStart(rowIndex, colIndex)
                                                    }}
                                                    className={cn(
                                                        "w-full h-[34px] flex items-center justify-center transition-colors duration-75",
                                                        !inMonth && "bg-slate-50 opacity-30",
                                                        inMonth && visual.startsWith("booked:") && "cursor-not-allowed bg-slate-400 text-white",
                                                        inMonth && visual.startsWith("draft:") && `cursor-pointer ${typeColor(visual.split(":")[1] || "REGULAR")}`,
                                                        inMonth && visual === 'available' && "bg-green-100 cursor-pointer hover:bg-green-200",
                                                        inMonth && visual === 'unavailable' && "bg-red-100 cursor-pointer hover:bg-red-200",
                                                        inMonth && visual === 'neutral' && "cursor-pointer hover:bg-slate-50",
                                                    )}
                                                >
                                                    {inMonth && visual.startsWith("booked:") && <span className="text-[9px] font-bold">済</span>}
                                                    {inMonth && visual.startsWith("draft:") && <span className="text-[9px] font-bold">{typeShort(visual.split(":")[1] || "REGULAR")}</span>}
                                                    {inMonth && visual === 'available' && <span className="text-[9px] text-green-600 font-medium">◯</span>}
                                                    {inMonth && visual === 'unavailable' && <span className="text-[9px] text-red-400">✕</span>}
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <DialogFooter className="flex-shrink-0">
                    <div className="flex justify-between w-full items-center">
                        <div className="text-sm text-muted-foreground">
                            {draftSlots.size}件のレッスンを保存予定
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDraftSlots(new Set())
                                    setDraftTypes(new Map())
                                    setDraftRooms(new Map())
                                }}
                            >
                                全削除
                            </Button>
                            <Button variant="outline" onClick={onClose}>キャンセル</Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                下書きを保存
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
