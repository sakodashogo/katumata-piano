"use client"
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
    addDays,
    addMonths,
    addMinutes,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    setHours,
    setMinutes,
    startOfDay,
    startOfWeek,
    subMonths,
} from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
    createMonthlySupportShifts,
    createSupportStaff,
    replaceSupportShiftsForStaffInRange,
    setSupportStaffActive,
} from "@/app/lib/actions/support"
import { CheckCheck, ChevronLeft, ChevronRight, Copy, Eraser, RotateCcw, Save } from "lucide-react"
import { isSlotClosed } from "@/lib/closed-days"

type SupportStaff = {
    id: string
    name: string
    active: boolean
}

type SupportShift = {
    id: string
    staffId: string
    startTime: Date | string
    endTime: Date | string
    staff?: { id: string; name: string; active: boolean } | null
}

type ClosedDayRecord = {
    id: string
    date: Date
    startTime: string | null
    endTime: string | null
    reason: string | null
}

type Props = {
    initialYear: number
    initialMonth: number
    staff: SupportStaff[]
    shifts: SupportShift[]
    closedDays?: ClosedDayRecord[]
}

type CellPos = { row: number; col: number }

const HOURS = Array.from({ length: 13 }, (_, idx) => idx + 9)
const MINUTES = [0, 30] as const

function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
    if (left.size !== right.size) return false
    for (const value of left) {
        if (!right.has(value)) return false
    }
    return true
}

function getCellIso(day: Date, hour: number, minute: number) {
    return setMinutes(setHours(new Date(day), hour), minute).toISOString()
}

function explodeShiftToSlots(start: Date, end: Date) {
    const slots: string[] = []
    let cursor = new Date(start)
    while (cursor < end) {
        slots.push(cursor.toISOString())
        cursor = addMinutes(cursor, 30)
    }
    return slots
}

export function SupportShiftPlanner({ initialYear, initialMonth, staff, shifts, closedDays = [] }: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const monthStart = useMemo(() => new Date(initialYear, initialMonth - 1, 1), [initialMonth, initialYear])
    const monthEndInclusive = useMemo(() => endOfMonth(monthStart), [monthStart])
    const monthEndExclusive = useMemo(() => addDays(monthEndInclusive, 1), [monthEndInclusive])
    const [weekStart, setWeekStart] = useState(() => startOfWeek(monthStart, { weekStartsOn: 1 }))
    const [newStaffName, setNewStaffName] = useState("")
    const activeStaff = useMemo(() => staff.filter((member) => member.active), [staff])
    const [selectedStaffId, setSelectedStaffId] = useState(activeStaff[0]?.id ?? staff[0]?.id ?? "")
    const [isSaving, setIsSaving] = useState(false)

    const [monthValue, setMonthValue] = useState(format(monthStart, "yyyy-MM"))
    const [weekdayFlags, setWeekdayFlags] = useState<Record<number, boolean>>({
        1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 0: false,
    })
    const [monthStartTime, setMonthStartTime] = useState("14:00")
    const [monthEndTime, setMonthEndTime] = useState("20:00")

    const [draftSlots, setDraftSlots] = useState<Set<string>>(new Set())
    const [isPainting, setIsPainting] = useState(false)
    const [paintMode, setPaintMode] = useState<"add" | "remove">("add")
    const [startCell, setStartCell] = useState<CellPos | null>(null)
    const [currentCell, setCurrentCell] = useState<CellPos | null>(null)

    const weekEnd = useMemo(
        () => endOfWeek(weekStart, { weekStartsOn: 1 }),
        [weekStart],
    )
    const monthStartMs = monthStart.getTime()
    const monthEndExclusiveMs = monthEndExclusive.getTime()
    const days = useMemo(
        () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
        [weekStart, weekEnd],
    )
    const isDayInMonth = useCallback(
        (day: Date) => day.getFullYear() === initialYear && day.getMonth() === initialMonth - 1,
        [initialMonth, initialYear]
    )

    useEffect(() => {
        setWeekStart(startOfWeek(monthStart, { weekStartsOn: 1 }))
        setMonthValue(format(monthStart, "yyyy-MM"))
    }, [monthStart])

    useEffect(() => {
        if (!selectedStaffId) {
            setSelectedStaffId(activeStaff[0]?.id ?? staff[0]?.id ?? "")
            return
        }
        if (!staff.some((member) => member.id === selectedStaffId)) {
            setSelectedStaffId(activeStaff[0]?.id ?? staff[0]?.id ?? "")
        }
    }, [activeStaff, selectedStaffId, staff])

    const baseSlotSet = useMemo(() => {
        if (!selectedStaffId) return new Set<string>()
        const set = new Set<string>()
        for (const shift of shifts) {
            if (shift.staffId !== selectedStaffId) continue
            const shiftStart = new Date(shift.startTime)
            const shiftEnd = new Date(shift.endTime)
            const clippedStart = shiftStart.getTime() > monthStartMs ? shiftStart : new Date(monthStartMs)
            const clippedEnd = shiftEnd.getTime() < monthEndExclusiveMs ? shiftEnd : new Date(monthEndExclusiveMs)
            if (clippedEnd <= clippedStart) continue
            explodeShiftToSlots(clippedStart, clippedEnd).forEach((iso) => set.add(iso))
        }
        return set
    }, [monthEndExclusiveMs, monthStartMs, selectedStaffId, shifts])

    useEffect(() => {
        setDraftSlots((prev) => {
            if (areSetsEqual(prev, baseSlotSet)) return prev
            return new Set(baseSlotSet)
        })
    }, [baseSlotSet])

    const pendingCount = useMemo(() => {
        let diff = 0
        for (const iso of draftSlots) {
            if (!baseSlotSet.has(iso)) diff++
        }
        for (const iso of baseSlotSet) {
            if (!draftSlots.has(iso)) diff++
        }
        return diff
    }, [baseSlotSet, draftSlots])

    const pendingRect = useMemo(() => {
        if (!isPainting || !startCell || !currentCell) return new Set<string>()
        const minRow = Math.min(startCell.row, currentCell.row)
        const maxRow = Math.max(startCell.row, currentCell.row)
        const minCol = Math.min(startCell.col, currentCell.col)
        const maxCol = Math.max(startCell.col, currentCell.col)
        const keys = new Set<string>()
        for (let row = minRow; row <= maxRow; row++) {
            const hour = HOURS[Math.floor(row / 2)]
            const minute = row % 2 === 0 ? 0 : 30
            for (let col = minCol; col <= maxCol; col++) {
                const day = days[col]
                if (!day) continue
                if (!isDayInMonth(day)) continue
                keys.add(getCellIso(day, hour, minute))
            }
        }
        return keys
    }, [currentCell, days, isDayInMonth, isPainting, startCell])

    const handleWeekMove = (offsetDays: number) => {
        setWeekStart((prev) => addDays(prev, offsetDays))
    }

    const handleMonthMove = (direction: "prev" | "next") => {
        const nextMonth = direction === "next" ? addMonths(monthStart, 1) : subMonths(monthStart, 1)
        const nextYear = nextMonth.getFullYear()
        const nextMonthValue = nextMonth.getMonth() + 1
        router.push(`/teacher/support?year=${nextYear}&month=${nextMonthValue}`)
    }

    const handleCreateStaff = async () => {
        const name = newStaffName.trim()
        if (!name) {
            toast.error("講師名を入力してください。")
            return
        }
        const result = await createSupportStaff(name)
        if (!result.success) {
            toast.error(result.error || "講師追加に失敗しました。")
            return
        }
        toast.success("講師を追加しました。")
        setNewStaffName("")
        router.refresh()
    }

    const handleToggleStaff = async (target: SupportStaff) => {
        const result = await setSupportStaffActive(target.id, !target.active)
        if (!result.success) {
            toast.error(result.error || "更新に失敗しました。")
            return
        }
        toast.success(target.active ? "無効化しました。" : "有効化しました。")
        router.refresh()
    }

    const handleMonthlyCreate = async () => {
        if (!selectedStaffId) {
            toast.error("講師を選択してください。")
            return
        }
        const [yearStr, monthStr] = monthValue.split("-")
        const [startHour, startMinute] = monthStartTime.split(":").map(Number)
        const [endHour, endMinute] = monthEndTime.split(":").map(Number)
        const weekdays = Object.entries(weekdayFlags)
            .filter(([, enabled]) => enabled)
            .map(([day]) => Number(day))
        const result = await createMonthlySupportShifts({
            staffId: selectedStaffId,
            year: Number(yearStr),
            month: Number(monthStr),
            weekdays,
            startHour,
            startMinute,
            endHour,
            endMinute,
        })
        if (!result.success) {
            toast.error(result.error || "月間登録に失敗しました。")
            return
        }
        const skippedClosed = typeof result.skippedClosed === "number" ? result.skippedClosed : 0
        if (skippedClosed > 0) {
            toast.info(`月間登録完了: 追加${result.created}件 / 重複等${result.skipped}件 / お休み重複${skippedClosed}件`)
        } else {
            toast.success(`月間登録完了: 追加${result.created}件 / スキップ${result.skipped}件`)
        }
        router.refresh()
    }

    const startPaint = (row: number, col: number) => {
        if (!selectedStaffId || isSaving) return
        const day = days[col]
        const hour = HOURS[Math.floor(row / 2)]
        const minute = row % 2 === 0 ? 0 : 30
        if (!day || hour === undefined || !isDayInMonth(day)) return
        const iso = getCellIso(day, hour, minute)
        setIsPainting(true)
        setPaintMode(draftSlots.has(iso) ? "remove" : "add")
        setStartCell({ row, col })
        setCurrentCell({ row, col })
    }

    const commitPaint = useCallback(() => {
        if (!isPainting) return
        const targetIsos = pendingRect
        if (targetIsos.size > 0) {
            setDraftSlots((prev) => {
                const next = new Set(prev)
                for (const iso of targetIsos) {
                    if (paintMode === "add") next.add(iso)
                    else next.delete(iso)
                }
                return next
            })
        }
        setIsPainting(false)
        setStartCell(null)
        setCurrentCell(null)
    }, [isPainting, paintMode, pendingRect])

    useEffect(() => {
        const handleMouseUp = () => commitPaint()
        window.addEventListener("mouseup", handleMouseUp)
        window.addEventListener("touchend", handleMouseUp)
        window.addEventListener("touchcancel", handleMouseUp)
        return () => {
            window.removeEventListener("mouseup", handleMouseUp)
            window.removeEventListener("touchend", handleMouseUp)
            window.removeEventListener("touchcancel", handleMouseUp)
        }
    }, [commitPaint])

    const batchSetWeek = (mode: "fill" | "clear") => {
        const next = new Set(draftSlots)
        for (const day of days) {
            if (!isDayInMonth(day)) continue
            for (const hour of HOURS) {
                for (const minute of MINUTES) {
                    const iso = getCellIso(day, hour, minute)
                    if (mode === "fill") next.add(iso)
                    else next.delete(iso)
                }
            }
        }
        setDraftSlots(next)
    }

    const applyWeekPatternToMonth = () => {
        const weekPattern = new Map<number, Map<string, boolean>>()
        for (const day of days) {
            const dayPattern = new Map<string, boolean>()
            for (const hour of HOURS) {
                for (const minute of MINUTES) {
                    const key = `${hour}:${minute}`
                    const iso = getCellIso(day, hour, minute)
                    dayPattern.set(key, draftSlots.has(iso))
                }
            }
            weekPattern.set(day.getDay(), dayPattern)
        }

        const next = new Set(draftSlots)
        let cursor = startOfDay(monthStart)
        while (cursor <= monthEndInclusive) {
            const pattern = weekPattern.get(cursor.getDay())
            if (pattern) {
                for (const hour of HOURS) {
                    for (const minute of MINUTES) {
                        const iso = getCellIso(cursor, hour, minute)
                        if (pattern.get(`${hour}:${minute}`)) next.add(iso)
                        else next.delete(iso)
                    }
                }
            }
            cursor = addDays(cursor, 1)
        }
        setDraftSlots(next)
    }

    const handleSaveMonth = async () => {
        if (!selectedStaffId) {
            toast.error("講師を選択してください。")
            return
        }
        setIsSaving(true)
        const result = await replaceSupportShiftsForStaffInRange({
            staffId: selectedStaffId,
            rangeStartIso: monthStart.toISOString(),
            rangeEndIso: monthEndExclusive.toISOString(),
            slotStartIsos: Array.from(draftSlots)
                .filter((iso) => {
                    const date = new Date(iso)
                    return date >= monthStart && date < monthEndExclusive
                })
                .sort(),
        })
        setIsSaving(false)
        if (!result.success) {
            toast.error(result.error || "保存に失敗しました。")
            return
        }
        const skippedClosed = typeof result.skippedClosedCount === "number" ? result.skippedClosedCount : 0
        if (skippedClosed > 0) {
            toast.info(`${initialYear}年${initialMonth}月を保存しました（お休み重複 ${skippedClosed}件は除外）。`)
        } else {
            toast.success(`${initialYear}年${initialMonth}月のシフトを保存しました。`)
        }
        router.refresh()
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="space-y-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h2 className="text-sm font-bold text-slate-900">サポート講師管理</h2>
                    <div className="mt-3 flex gap-2">
                        <input
                            value={newStaffName}
                            onChange={(e) => setNewStaffName(e.target.value)}
                            placeholder="例: バイトC"
                            className="h-9 flex-1 rounded border px-2 text-sm"
                        />
                        <Button onClick={handleCreateStaff}>追加</Button>
                    </div>
                    <div className="mt-3 space-y-2">
                        {staff.map((member) => (
                            <div key={member.id} className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1.5 text-xs">
                                <span className={member.active ? "text-slate-800" : "text-slate-400 line-through"}>
                                    {member.name}
                                </span>
                                <Button size="sm" variant="outline" onClick={() => handleToggleStaff(member)}>
                                    {member.active ? "無効化" : "有効化"}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="text-sm font-bold text-slate-900">編集対象講師</div>
                    <select
                        value={selectedStaffId}
                        onChange={(e) => setSelectedStaffId(e.target.value)}
                        className="mt-2 h-9 w-full rounded border px-2 text-sm"
                    >
                        {activeStaff.map((member) => (
                            <option key={member.id} value={member.id}>
                                {member.name}
                            </option>
                        ))}
                    </select>
                    {activeStaff.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">有効なサポート講師がいません。</p>
                    )}
                </div>

                <div className="rounded-xl border bg-blue-50 p-4 shadow-sm">
                    <div className="text-xs font-semibold text-blue-800">月間シフト一括登録</div>
                    <div className="mt-2 space-y-2">
                        <input
                            type="month"
                            value={monthValue}
                            onChange={(e) => setMonthValue(e.target.value)}
                            className="h-9 w-full rounded border bg-white px-2 text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="time"
                                value={monthStartTime}
                                onChange={(e) => setMonthStartTime(e.target.value)}
                                className="h-9 rounded border bg-white px-2 text-sm"
                            />
                            <input
                                type="time"
                                value={monthEndTime}
                                onChange={(e) => setMonthEndTime(e.target.value)}
                                className="h-9 rounded border bg-white px-2 text-sm"
                            />
                        </div>
                        <div className="rounded border bg-white px-2 py-1.5 text-xs">
                            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                                <label key={day} className="mr-2 inline-flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={weekdayFlags[day]}
                                        onChange={(e) =>
                                            setWeekdayFlags((prev) => ({ ...prev, [day]: e.target.checked }))
                                        }
                                    />
                                    {["日", "月", "火", "水", "木", "金", "土"][day]}
                                </label>
                            ))}
                        </div>
                        <Button className="w-full" onClick={handleMonthlyCreate} disabled={!selectedStaffId}>
                            月間一括登録
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMonthMove("prev")}
                    >
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        前月
                    </Button>
                    <div className="text-lg font-bold text-slate-900">
                        {initialYear}年 {initialMonth}月
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMonthMove("next")}
                    >
                        次月
                        <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 rounded border bg-slate-50 px-2 py-1">
                        <Button variant="ghost" size="sm" onClick={() => handleWeekMove(-7)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-[180px] text-center text-sm font-semibold">
                            {format(weekStart, "M/d", { locale: ja })} - {format(weekEnd, "M/d", { locale: ja })}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => handleWeekMove(7)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setDraftSlots(new Set(baseSlotSet))}
                            disabled={isSaving || pendingCount === 0}
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            変更を破棄
                        </Button>
                        <Button onClick={handleSaveMonth} disabled={isSaving || pendingCount === 0 || !selectedStaffId}>
                            <Save className="mr-2 h-4 w-4" />
                            {isSaving ? "保存中..." : `月を保存 (${pendingCount})`}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-3 shadow-sm">
                    <Button size="sm" variant="outline" onClick={() => batchSetWeek("fill")} disabled={!selectedStaffId}>
                        <CheckCheck className="mr-1 h-3.5 w-3.5" />
                        この週を全て勤務
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batchSetWeek("clear")} disabled={!selectedStaffId}>
                        <Eraser className="mr-1 h-3.5 w-3.5" />
                        この週をクリア
                    </Button>
                    <Button size="sm" variant="secondary" onClick={applyWeekPatternToMonth} disabled={!selectedStaffId}>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        この週のパターンを月全体に適用
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-cyan-700">登録済みシフト</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">追加予定</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">削除予定</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-700">ドラッグで矩形選択</span>
                </div>

                <div className="overflow-auto rounded-xl border bg-white shadow-sm" onMouseLeave={commitPaint}>
                    <table className="w-full min-w-[980px] border-collapse text-center text-sm select-none">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr>
                                <th className="w-16 border-r px-1 py-2 text-xs text-slate-500">時間</th>
                                {days.map((day) => (
                                    <th
                                        key={day.toISOString()}
                                        className={cn("border-r px-0.5 py-2 text-xs last:border-r-0", isSameDay(day, new Date()) && "bg-blue-50")}
                                    >
                                        <div className="font-semibold">{format(day, "M/d (E)", { locale: ja })}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {HOURS.flatMap((hour) =>
                                MINUTES.map((minute) => {
                                    const rowIndex = (hour - HOURS[0]) * 2 + (minute === 30 ? 1 : 0)
                                    return (
                                        <tr key={`${hour}-${minute}`}>
                                            <td className={cn("border-r px-1 text-[11px] text-slate-400", minute === 0 ? "font-mono" : "font-mono opacity-50")}>
                                                {minute === 0 ? `${hour}:00` : `${hour}:30`}
                                            </td>
                                            {days.map((day, colIndex) => {
                                                const inMonth = isDayInMonth(day)
                                                const iso = getCellIso(day, hour, minute)
                                                const hasBase = baseSlotSet.has(iso)
                                                const hasDraft = draftSlots.has(iso)
                                                const inRect = pendingRect.has(iso)
                                                const cellStart = setMinutes(setHours(new Date(day), hour), minute)
                                                const cellEnd = addMinutes(cellStart, 30)
                                                const cellClosed = inMonth && isSlotClosed(closedDays, cellStart, cellEnd)
                                                return (
                                                    <td key={day.toISOString()} className="border-r p-0.5 last:border-r-0">
                                                        <div
                                                            data-row={rowIndex}
                                                            data-col={colIndex}
                                                            onMouseDown={(e) => {
                                                                if (e.button !== 0) return
                                                                if (!inMonth || cellClosed) return
                                                                e.preventDefault()
                                                                startPaint(rowIndex, colIndex)
                                                            }}
                                                            onMouseEnter={() => {
                                                                if (!isPainting) return
                                                                if (!inMonth || cellClosed) return
                                                                setCurrentCell({ row: rowIndex, col: colIndex })
                                                            }}
                                                            onTouchStart={() => {
                                                                if (!inMonth || cellClosed) return
                                                                startPaint(rowIndex, colIndex)
                                                            }}
                                                            className={cn(
                                                                "relative h-8 rounded border transition-colors",
                                                                !inMonth && "border-slate-100 bg-slate-50 opacity-40",
                                                                cellClosed && "border-rose-200 bg-rose-100/70",
                                                                !cellClosed && hasDraft ? "border-cyan-300 bg-cyan-50" : !cellClosed && "border-dashed border-slate-200",
                                                                !cellClosed && inRect && paintMode === "add" && "border-emerald-300 bg-emerald-100",
                                                                !cellClosed && inRect && paintMode === "remove" && "border-rose-300 bg-rose-100",
                                                            )}
                                                        >
                                                            {cellClosed && <span className="text-[9px] font-bold text-rose-500">お休み</span>}
                                                            {!cellClosed && inMonth && hasDraft && !inRect && <span className="text-[10px] font-semibold text-cyan-700">勤務</span>}
                                                            {!cellClosed && inMonth && inRect && paintMode === "add" && <span className="text-[10px] font-semibold text-emerald-700">追加</span>}
                                                            {!cellClosed && inMonth && inRect && paintMode === "remove" && <span className="text-[10px] font-semibold text-rose-700">削除</span>}
                                                            {!cellClosed && inMonth && !hasDraft && hasBase && !inRect && (
                                                                <span className="text-[10px] font-semibold text-rose-600">削除予定</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
