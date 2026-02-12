"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays, isSameDay, setHours, setMinutes, addMinutes } from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronLeft, ChevronRight, Save, RotateCcw } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { LESSON_TYPE_LABELS, ROOMS } from "@/lib/constants"
import { bulkUpdateOpenSlots } from "@/app/lib/actions/schedule"
import { useRouter } from "next/navigation"

// Types
type OpenSlot = {
    id: string
    roomId: string
    startTime: Date | string
    endTime: Date | string
    isBooked: boolean
    isPublic: boolean
}

type Lesson = {
    id: string
    roomId: string | null
    startTime: Date | string
    endTime: Date | string
    type: string
    status: "BOOKED" | "CANCELLED" | "COMPLETED" | "DRAFT" | string
    student: { name: string | null }
}

type Props = {
    initialDate?: Date
    slots: OpenSlot[]
    lessons: Lesson[]
}

type ScheduleListItem = {
    id: string
    kind: "lesson" | "slot"
    startTime: Date
    endTime: Date
    roomId: string
    studentName: string | null
    lessonType: string
    statusLabel: string
    statusClass: string
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9) // 09:00 - 21:00
const MINUTES = [0, 30]
type RoomFilter = "all" | "A" | "B"
type PaintMode = "add" | "remove"
type SlotDraftAction = "add" | "remove"

type PaintCell = {
    row: number
    col: number
    roomId: string
    gridCol: number
    key: string
}

export function AdminCalendar({ initialDate = new Date(), slots: initialSlots, lessons: initialLessons }: Props) {
    const router = useRouter()
    const { toast } = useToast()
    const gridRef = useRef<HTMLDivElement>(null)

    // State
    const [currentDate, setCurrentDate] = useState(initialDate)
    const [isEditMode, setIsEditMode] = useState(false)
    const [localSlots, setLocalSlots] = useState<OpenSlot[]>(initialSlots)
    const [localLessons, setLocalLessons] = useState<Lesson[]>(initialLessons)
    const [slotDraftMap, setSlotDraftMap] = useState<Map<string, SlotDraftAction>>(new Map())
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [studentFilter, setStudentFilter] = useState("")
    const [roomFilter, setRoomFilter] = useState<RoomFilter>("all")
    const [lessonTypeFilter, setLessonTypeFilter] = useState("all")
    const [isPainting, setIsPainting] = useState(false)
    const [paintMode, setPaintMode] = useState<PaintMode>("add")
    const [paintedCellKeys, setPaintedCellKeys] = useState<Set<string>>(new Set())
    const [paintStartCell, setPaintStartCell] = useState<PaintCell | null>(null)

    // Sync props to state on server refresh
    useEffect(() => {
        setLocalSlots(initialSlots)
        setLocalLessons(initialLessons)
    }, [initialSlots, initialLessons])

    // Calendar Grid
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

    const lessonTypeOptions = useMemo(() => {
        return Array.from(new Set(localLessons.map((lesson) => lesson.type))).sort()
    }, [localLessons])

    const weeklyListItems = useMemo<ScheduleListItem[]>(() => {
        const weekStartMs = weekStart.getTime()
        const weekEndMs = weekEnd.getTime()
        const inWeek = (date: Date) => date.getTime() >= weekStartMs && date.getTime() <= weekEndMs
        const items: ScheduleListItem[] = []

        for (const lesson of localLessons) {
            const start = new Date(lesson.startTime)
            if (!inWeek(start)) continue

            items.push({
                id: `lesson-${lesson.id}`,
                kind: "lesson",
                startTime: start,
                endTime: new Date(lesson.endTime),
                roomId: lesson.roomId || ROOMS.A.id,
                studentName: lesson.student?.name || "名前未設定",
                lessonType: lesson.type,
                statusLabel: lesson.status === "DRAFT" ? "振替待ち" : "予約済み",
                statusClass: lesson.status === "DRAFT"
                    ? "text-amber-700 bg-amber-50 border-amber-200"
                    : "text-green-700 bg-green-50 border-green-200",
            })
        }

        for (const slot of localSlots) {
            const start = new Date(slot.startTime)
            if (!inWeek(start)) continue

            const status = slot.isBooked
                ? {
                    label: "予約済み",
                    className: "text-slate-700 bg-slate-100 border-slate-200",
                }
                : slot.isPublic
                    ? {
                        label: "空き枠（公開）",
                        className: "text-blue-700 bg-blue-50 border-blue-200",
                    }
                    : {
                        label: "空き枠（下書き）",
                        className: "text-amber-700 bg-amber-50 border-amber-200",
                    }

            items.push({
                id: `slot-${slot.id}`,
                kind: "slot",
                startTime: start,
                endTime: new Date(slot.endTime),
                roomId: slot.roomId,
                studentName: null,
                lessonType: "OPEN_SLOT",
                statusLabel: status.label,
                statusClass: status.className,
            })
        }

        return items.sort((a, b) => {
            const timeDiff = a.startTime.getTime() - b.startTime.getTime()
            if (timeDiff !== 0) return timeDiff
            return a.roomId.localeCompare(b.roomId)
        })
    }, [localLessons, localSlots, weekStart, weekEnd])

    const filteredListItems = useMemo(() => {
        const search = studentFilter.trim().toLowerCase()
        return weeklyListItems.filter((item) => {
            if (roomFilter !== "all" && item.roomId !== roomFilter) return false
            if (lessonTypeFilter !== "all" && item.lessonType !== lessonTypeFilter) return false

            if (search.length > 0) {
                if (item.kind !== "lesson") return false
                const studentName = (item.studentName || "").toLowerCase()
                if (!studentName.includes(search)) return false
            }

            return true
        })
    }, [weeklyListItems, roomFilter, lessonTypeFilter, studentFilter])

    const getCellKey = (roomId: string, time: number) => `${roomId}:${time}`
    const parseCellKey = (cellKey: string) => {
        const [roomId, timeStr] = cellKey.split(":")
        return { roomId, time: Number(timeStr) }
    }
    const getRowIndex = (hour: number, minute: number) => (hour - HOURS[0]) * MINUTES.length + (minute === 30 ? 1 : 0)
    const getHourMinuteFromRow = (row: number) => ({
        hour: HOURS[0] + Math.floor(row / MINUTES.length),
        minute: row % MINUTES.length === 0 ? 0 : 30
    })

    const getBaseItemsByCellKey = (cellKey: string) => {
        const { roomId, time } = parseCellKey(cellKey)
        const slot = localSlots.find(s =>
            s.roomId === roomId &&
            new Date(s.startTime).getTime() === time
        )
        const lesson = localLessons.find(l =>
            (l.roomId === roomId || (!l.roomId && roomId === ROOMS.A.id)) &&
            new Date(l.startTime).getTime() === time
        )
        return { slot, lesson }
    }

    const getEffectiveItemsByCellKey = (cellKey: string, draftMap: Map<string, SlotDraftAction>) => {
        const base = getBaseItemsByCellKey(cellKey)
        const draftAction = draftMap.get(cellKey)
        if (base.lesson || base.slot?.isBooked) {
            return { slot: base.slot, lesson: base.lesson, draftAction: undefined as SlotDraftAction | undefined, isDraftAdded: false, isDraftRemoved: false }
        }

        if (draftAction === "remove" && base.slot) {
            return { slot: undefined, lesson: base.lesson, draftAction, isDraftAdded: false, isDraftRemoved: true }
        }

        if (draftAction === "add" && !base.slot) {
            const { roomId, time } = parseCellKey(cellKey)
            const start = new Date(time)
            const virtualSlot: OpenSlot = {
                id: `draft:${cellKey}`,
                roomId,
                startTime: start,
                endTime: addMinutes(start, 30),
                isBooked: false,
                isPublic: false
            }
            return { slot: virtualSlot, lesson: base.lesson, draftAction, isDraftAdded: true, isDraftRemoved: false }
        }

        return { slot: base.slot, lesson: base.lesson, draftAction, isDraftAdded: false, isDraftRemoved: false }
    }

    const getCellItems = (day: Date, hour: number, minute: number, roomId: string) => {
        const time = setMinutes(setHours(day, hour), minute).getTime()
        return getEffectiveItemsByCellKey(getCellKey(roomId, time), slotDraftMap)
    }

    const isEditableCellKey = (cellKey: string, draftMap: Map<string, SlotDraftAction>) => {
        const effective = getEffectiveItemsByCellKey(cellKey, draftMap)
        return !effective.lesson && !effective.slot?.isBooked
    }

    const commitDraftActionForCell = (next: Map<string, SlotDraftAction>, cellKey: string, mode: PaintMode) => {
        const base = getBaseItemsByCellKey(cellKey)
        if (base.lesson || base.slot?.isBooked) return false

        const effective = getEffectiveItemsByCellKey(cellKey, next)
        const hasEffectiveSlot = !!effective.slot
        const currentDraft = next.get(cellKey)

        if (mode === "add") {
            if (!hasEffectiveSlot) {
                if (base.slot) {
                    next.delete(cellKey)
                } else {
                    next.set(cellKey, "add")
                }
                return true
            }
            if (base.slot && currentDraft === "remove") {
                next.delete(cellKey)
                return true
            }
            return false
        }

        if (hasEffectiveSlot) {
            if (!base.slot && currentDraft === "add") {
                next.delete(cellKey)
            } else if (base.slot) {
                next.set(cellKey, "remove")
            }
            return true
        }

        return false
    }

    const clearPaintingState = () => {
        setIsPainting(false)
        setPaintedCellKeys(new Set())
        setPaintStartCell(null)
    }

    const getRectCellKeys = (start: PaintCell, current: PaintCell) => {
        const minRow = Math.min(start.row, current.row)
        const maxRow = Math.max(start.row, current.row)
        const minCol = Math.min(start.gridCol, current.gridCol)
        const maxCol = Math.max(start.gridCol, current.gridCol)
        const keys = new Set<string>()

        for (let row = minRow; row <= maxRow; row++) {
            const { hour, minute } = getHourMinuteFromRow(row)
            for (let gridCol = minCol; gridCol <= maxCol; gridCol++) {
                const dayIndex = Math.floor(gridCol / 2)
                const day = days[dayIndex]
                if (!day) continue
                const roomId = gridCol % 2 === 0 ? ROOMS.A.id : ROOMS.B.id
                const time = setMinutes(setHours(day, hour), minute).getTime()
                const cellKey = getCellKey(roomId, time)
                if (isEditableCellKey(cellKey, slotDraftMap)) {
                    keys.add(cellKey)
                }
            }
        }
        return keys
    }

    const startPaint = (cell: PaintCell) => {
        if (!isEditMode || isSubmitting) return

        const effective = getEffectiveItemsByCellKey(cell.key, slotDraftMap)
        if (effective.lesson || effective.slot?.isBooked) return

        setIsPainting(true)
        setPaintMode(effective.slot ? "remove" : "add")
        setPaintStartCell(cell)
        setPaintedCellKeys(new Set([cell.key]))
    }

    const updatePaint = (cell: PaintCell) => {
        if (!isPainting) return

        if (!paintStartCell) return
        setPaintedCellKeys(getRectCellKeys(paintStartCell, cell))
    }

    const commitPaint = () => {
        if (!isPainting) return
        setSlotDraftMap(prev => {
            const next = new Map(prev)
            for (const cellKey of paintedCellKeys) {
                commitDraftActionForCell(next, cellKey, paintMode)
            }
            return next
        })
        clearPaintingState()
    }

    // Handlers

    const handleSaveChanges = async () => {
        const totalPending = slotDraftMap.size
        if (totalPending === 0) return
        if (!confirm(`${totalPending}件の変更を保存しますか？`)) return

        setIsSubmitting(true)
        let appliedCount = 0
        let skippedCount = 0
        let failureCount = 0
        let firstError = ""
        const nextSlotDraftMap = new Map(slotDraftMap)

        try {
            const grouped = new Map<string, { add: string[], remove: string[], addKeys: string[], removeKeys: string[] }>()
            for (const [cellKey, action] of Array.from(slotDraftMap.entries())) {
                const base = getBaseItemsByCellKey(cellKey)
                if (base.lesson || base.slot?.isBooked) {
                    skippedCount++
                    nextSlotDraftMap.delete(cellKey)
                    continue
                }

                const { roomId, time } = parseCellKey(cellKey)
                const iso = new Date(time).toISOString()
                const roomGroup = grouped.get(roomId) || { add: [], remove: [], addKeys: [], removeKeys: [] }
                if (action === "add") {
                    roomGroup.add.push(iso)
                    roomGroup.addKeys.push(cellKey)
                } else {
                    roomGroup.remove.push(iso)
                    roomGroup.removeKeys.push(cellKey)
                }
                grouped.set(roomId, roomGroup)
            }

            for (const [roomId, group] of Array.from(grouped.entries())) {
                if (group.add.length > 0) {
                    const res = await bulkUpdateOpenSlots(roomId, group.add, "add")
                    if (res.success) {
                        appliedCount += group.add.length
                        group.addKeys.forEach(key => nextSlotDraftMap.delete(key))
                    } else {
                        failureCount += group.add.length
                        if (!firstError && res.error) firstError = res.error
                    }
                }
                if (group.remove.length > 0) {
                    const res = await bulkUpdateOpenSlots(roomId, group.remove, "remove")
                    if (res.success) {
                        appliedCount += group.remove.length
                        group.removeKeys.forEach(key => nextSlotDraftMap.delete(key))
                    } else {
                        failureCount += group.remove.length
                        if (!firstError && res.error) firstError = res.error
                    }
                }
            }

            setSlotDraftMap(nextSlotDraftMap)

            if (failureCount === 0 && skippedCount === 0) {
                toast.success(`${appliedCount}件の変更を保存しました。`)
            } else if (appliedCount > 0) {
                toast.info(`一部反映: 反映${appliedCount}件 / 除外${skippedCount}件 / 失敗${failureCount}件`)
            } else {
                toast.error(firstError || `${failureCount}件の変更を保存できませんでした。`)
            }

            if (appliedCount > 0) {
                router.refresh()
            }
            if (nextSlotDraftMap.size === 0) {
                setIsEditMode(false)
            }
        } catch (e) {
            console.error(e)
            toast.error("保存中にエラーが発生しました")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleUndoAll = () => {
        if (confirm("全ての変更を取り消しますか？")) {
            setLocalSlots(initialSlots)
            setLocalLessons(initialLessons)
            setSlotDraftMap(new Map())
            clearPaintingState()
        }
    }

    useEffect(() => {
        const handler = () => commitPaint()
        window.addEventListener("mouseup", handler)
        window.addEventListener("touchend", handler)
        window.addEventListener("touchcancel", handler)
        return () => {
            window.removeEventListener("mouseup", handler)
            window.removeEventListener("touchend", handler)
            window.removeEventListener("touchcancel", handler)
        }
    })

    useEffect(() => {
        const el = gridRef.current
        if (!el) return
        const handler = (e: TouchEvent) => {
            if (!isPainting) return
            e.preventDefault()
            const touch = e.touches[0]
            const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
            const cellEl = target?.closest<HTMLElement>("[data-cell-key]")
            if (!cellEl) return
            const row = Number(cellEl.dataset.row)
            const col = Number(cellEl.dataset.col)
            const roomId = cellEl.dataset.room
            const cellKey = cellEl.dataset.cellKey
            if (Number.isNaN(row) || Number.isNaN(col) || !roomId || !cellKey) return
            const gridCol = col * 2 + (roomId === ROOMS.B.id ? 1 : 0)
            updatePaint({ row, col, roomId, gridCol, key: cellKey })
        }
        el.addEventListener("touchmove", handler, { passive: false })
        return () => el.removeEventListener("touchmove", handler)
    })

    // Droppable Cell Component
    const DroppableCell = ({ day, hour, minute, rowIndex, colIndex, roomId, items, isEditMode: editMode, label }: {
        day: Date, hour: number, minute: number, roomId: string,
        rowIndex: number, colIndex: number,
        items: { slot?: OpenSlot, lesson?: Lesson, draftAction?: SlotDraftAction, isDraftAdded?: boolean, isDraftRemoved?: boolean },
        isEditMode: boolean,
        label: string
    }) => {
        const time = setMinutes(setHours(day, hour), minute).getTime()
        const cellKey = getCellKey(roomId, time)
        const gridCol = colIndex * 2 + (roomId === ROOMS.B.id ? 1 : 0)

        const hasItem = items.slot || items.lesson
        const isPendingPaint = isPainting && paintedCellKeys.has(cellKey)
        const canPaint = editMode && !items.lesson && !items.slot?.isBooked
        const showDraftPreview = !!items.isDraftAdded && !items.lesson
        const showRemovedPreview = !!items.isDraftRemoved && !items.lesson

        return (
            <div
                data-cell-key={cellKey}
                data-row={rowIndex}
                data-col={colIndex}
                data-room={roomId}
                onMouseDown={(e) => {
                    if (e.button !== 0) return
                    e.preventDefault()
                    startPaint({ row: rowIndex, col: colIndex, roomId, gridCol, key: cellKey })
                }}
                onMouseEnter={() => {
                    updatePaint({ row: rowIndex, col: colIndex, roomId, gridCol, key: cellKey })
                }}
                onTouchStart={() => {
                    startPaint({ row: rowIndex, col: colIndex, roomId, gridCol, key: cellKey })
                }}
                className={cn(
                    "rounded min-h-[30px] flex items-center justify-center relative transition-colors text-xs select-none",
                    editMode ? "cursor-pointer" : "cursor-default",
                    editMode && !hasItem ? "hover:bg-slate-100" : "",
                    editMode && hasItem ? "hover:brightness-95" : "",
                    isPendingPaint && paintMode === "add" ? "ring-2 ring-blue-400 bg-blue-100/70" : "",
                    isPendingPaint && paintMode === "remove" ? "ring-2 ring-rose-400 bg-rose-100/70" : "",
                    showDraftPreview ? "ring-1 ring-blue-400 bg-blue-100/60" : "",
                    showRemovedPreview ? "ring-1 ring-rose-300 bg-rose-50/80" : "",
                    items.lesson ? (items.lesson.status === "DRAFT" ? "bg-amber-50" : "bg-green-50") :
                        items.slot ? (items.slot.isBooked ? "bg-slate-100" : (items.slot.isPublic ? "bg-blue-50" : "bg-amber-50")) :
                            "border border-dashed border-slate-100"
                )}
            >
                {!hasItem && <span className="text-[8px] text-slate-200 pointer-events-none absolute">{label}</span>}
                {showDraftPreview && <span className="text-[9px] font-bold text-blue-700 pointer-events-none">追加予定</span>}
                {showRemovedPreview && <span className="text-[9px] font-bold text-rose-600 pointer-events-none">削除予定</span>}
                {isPendingPaint && canPaint && (
                    <span className={cn("text-[9px] font-bold pointer-events-none", paintMode === "add" ? "text-blue-700" : "text-rose-600")}>
                        {paintMode === "add" ? "追加" : "削除"}
                    </span>
                )}

                {items.slot && !items.isDraftAdded && (
                    <CellItem item={items.slot} type="slot" />
                )}

                {items.lesson && (
                    <CellItem item={items.lesson} type="lesson" />
                )}
            </div>
        )
    }

    const CellItem = ({ item, type }: { item: OpenSlot | Lesson, type: "slot" | "lesson" }) => {
        let bgClass = "bg-slate-100"
        let borderClass = "border-slate-200"
        let content = null

        if (type === "lesson") {
            const l = item as Lesson
            const isDraft = l.status === "DRAFT"
            bgClass = isDraft ? "bg-amber-100" : "bg-green-100"
            borderClass = isDraft ? "border-amber-300" : "border-green-300"
            content = (
                <div className="w-full h-full p-1 leading-tight overflow-hidden">
                    <div className="font-bold truncate text-green-900">{l.student.name}</div>
                    {isDraft && <span className="text-[8px] bg-amber-200 text-amber-800 px-1 rounded inline-block mt-0.5">未公開</span>}
                </div>
            )
        } else {
            const s = item as OpenSlot
            if (s.isBooked) {
                bgClass = "bg-slate-200"
                borderClass = "border-slate-300"
                content = <div className="text-[9px] text-slate-500 font-medium">予約済</div>
            } else if (s.isPublic) {
                bgClass = "bg-blue-50"
                borderClass = "border-blue-200"
                content = <div className="text-[9px] text-blue-700 font-medium">公開中</div>
            } else {
                bgClass = "bg-amber-50"
                borderClass = "border-amber-200"
                content = <div className="text-[9px] text-amber-700 font-medium">下書き</div>
            }
        }

        return (
            <div
                className={cn(
                    "w-full h-full rounded border shadow-sm absolute inset-0 transition-opacity flex flex-col items-center justify-center p-0.5",
                    bgClass,
                    borderClass
                )}
            >
                {content}
            </div>
        )
    }

    const pendingCount = slotDraftMap.size

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-md border bg-slate-50">
                        <Button variant="ghost" className="w-8 h-8 p-0" onClick={() => setCurrentDate(d => addDays(d, -7))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-4 font-bold text-lg min-w-[140px] text-center">
                            {format(weekStart, "M/d", { locale: ja })} - {format(weekEnd, "M/d", { locale: ja })}
                        </span>
                        <Button variant="ghost" className="w-8 h-8 p-0" onClick={() => setCurrentDate(d => addDays(d, 7))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 mr-4 bg-slate-50 px-3 py-1.5 rounded-full border">
                        <span className="text-sm font-medium text-slate-600">編集モード</span>
                        <div
                            className={cn("w-10 h-6 rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out", isEditMode ? "bg-blue-600" : "bg-slate-300")}
                            onClick={() => {
                                if (isEditMode && pendingCount > 0) {
                                    if (!confirm("変更を破棄してモードを終了しますか？")) return
                                    handleUndoAll()
                                }
                                setIsEditMode(!isEditMode)
                            }}
                        >
                            <div className={cn("w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out", isEditMode ? "translate-x-4" : "")} />
                        </div>
                    </div>

                    {pendingCount > 0 && (
                        <>
                            <Button variant="outline" size="sm" onClick={handleUndoAll}>
                                <RotateCcw className="h-4 w-4 mr-2" /> 元に戻す
                            </Button>
                            <Button
                                className="bg-blue-600 text-white hover:bg-blue-700"
                                size="sm"
                                onClick={handleSaveChanges}
                                disabled={isSubmitting}
                            >
                                <Save className="h-4 w-4 mr-2" /> 保存 ({pendingCount})
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700">空き枠（公開）</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700">空き枠（下書き）</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-green-700">予約済み</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-800">振替待ち</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-700">ドラッグ: 矩形選択</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-rose-700">保存で確定</span>
            </div>

                {/* Calendar */}
                <ScrollArea className="h-[calc(100vh-200px)] border rounded-md bg-white">
                    <div
                        ref={gridRef}
                        className="min-w-[1000px] p-4 select-none"
                        onMouseLeave={commitPaint}
                        onMouseMove={(e) => {
                            if (!isPainting) return
                            const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
                            const cellEl = target?.closest<HTMLElement>("[data-cell-key]")
                            if (!cellEl) return
                            const row = Number(cellEl.dataset.row)
                            const col = Number(cellEl.dataset.col)
                            const roomId = cellEl.dataset.room
                            const cellKey = cellEl.dataset.cellKey
                            if (Number.isNaN(row) || Number.isNaN(col) || !roomId || !cellKey) return
                            const gridCol = col * 2 + (roomId === ROOMS.B.id ? 1 : 0)
                            updatePaint({ row, col, roomId, gridCol, key: cellKey })
                        }}
                    >
                        <div className="grid grid-cols-[80px_repeat(7,_1fr)] border-b bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <div className="p-2 text-center text-xs font-bold text-slate-500 py-3">時間</div>
                            {days.map(day => (
                                <div key={day.toISOString()} className={cn("p-2 text-center border-l", isSameDay(day, new Date()) ? "bg-blue-50/50" : "")}>
                                    <div className="font-bold text-slate-700">{format(day, "M/d (E)", { locale: ja })}</div>
                                </div>
                            ))}
                        </div>

                        <div className="divide-y relative">
                            {HOURS.map(hour => (
                                MINUTES.map(minute => (
                                    <div key={`${hour}-${minute}`} className="grid grid-cols-[80px_repeat(7,_1fr)] min-h-[50px]">
                                        <div className="p-2 text-xs text-slate-400 text-right border-r flex items-start justify-end pr-3 pt-1">
                                            {minute === 0 ? <span className="font-mono">{hour}:00</span> : <span className="font-mono text-slate-200">{hour}:30</span>}
                                        </div>
                                        {days.map((day, colIndex) => (
                                            <div key={day.toISOString()} className="border-r border-dotted p-0.5 grid grid-cols-2 gap-0.5">
                                                <DroppableCell
                                                    rowIndex={getRowIndex(hour, minute)}
                                                    colIndex={colIndex}
                                                    day={day} hour={hour} minute={minute} roomId={ROOMS.A.id}
                                                    items={getCellItems(day, hour, minute, ROOMS.A.id)}
                                                    isEditMode={isEditMode}
                                                    label="A"
                                                />
                                                <DroppableCell
                                                    rowIndex={getRowIndex(hour, minute)}
                                                    colIndex={colIndex}
                                                    day={day} hour={hour} minute={minute} roomId={ROOMS.B.id}
                                                    items={getCellItems(day, hour, minute, ROOMS.B.id)}
                                                    isEditMode={isEditMode}
                                                    label="B"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ))
                            ))}
                        </div>
                    </div>
                </ScrollArea>

            <div className="rounded-lg border bg-white">
                <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">統合リスト</h2>
                        <p className="text-xs text-slate-500">生徒名・部屋・レッスン種別で絞り込みできます</p>
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                        {filteredListItems.length}件表示 / 全{weeklyListItems.length}件
                    </div>
                </div>

                <div className="grid gap-3 border-b p-4 md:grid-cols-3">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500">生徒名</label>
                        <input
                            value={studentFilter}
                            onChange={(e) => setStudentFilter(e.target.value)}
                            placeholder="例: 田中"
                            className="h-9 w-full rounded-md border px-3 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500">部屋</label>
                        <select
                            value={roomFilter}
                            onChange={(e) => setRoomFilter(e.target.value as RoomFilter)}
                            className="h-9 w-full rounded-md border px-3 text-sm"
                        >
                            <option value="all">すべて</option>
                            <option value="A">Room A</option>
                            <option value="B">Room B</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500">種別</label>
                        <select
                            value={lessonTypeFilter}
                            onChange={(e) => setLessonTypeFilter(e.target.value)}
                            className="h-9 w-full rounded-md border px-3 text-sm"
                        >
                            <option value="all">すべて</option>
                            <option value="OPEN_SLOT">空き枠</option>
                            {lessonTypeOptions.map((type) => (
                                <option key={type} value={type}>
                                    {LESSON_TYPE_LABELS[type] || type}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="max-h-[360px] overflow-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left">日付</th>
                                <th className="px-3 py-2 text-left">時間</th>
                                <th className="px-3 py-2 text-left">部屋</th>
                                <th className="px-3 py-2 text-left">種別</th>
                                <th className="px-3 py-2 text-left">生徒</th>
                                <th className="px-3 py-2 text-left">ステータス</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredListItems.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                                        条件に一致する予定がありません。
                                    </td>
                                </tr>
                            )}
                            {filteredListItems.map((item) => (
                                <tr key={item.id} className="border-t">
                                    <td className="px-3 py-2 text-slate-700">
                                        {format(item.startTime, "M/d (E)", { locale: ja })}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-800">
                                        {format(item.startTime, "HH:mm")} - {format(item.endTime, "HH:mm")}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">Room {item.roomId}</td>
                                    <td className="px-3 py-2 text-slate-700">
                                        {item.lessonType === "OPEN_SLOT"
                                            ? "空き枠"
                                            : (LESSON_TYPE_LABELS[item.lessonType] || item.lessonType)}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">{item.studentName || "-"}</td>
                                    <td className="px-3 py-2">
                                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${item.statusClass}`}>
                                            {item.statusLabel}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
