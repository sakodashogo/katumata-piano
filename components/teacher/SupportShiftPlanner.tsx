"use client"
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
    addDays,
    addMinutes,
    eachDayOfInterval,
    endOfWeek,
    format,
    isSameDay,
    setHours,
    setMinutes,
    startOfWeek,
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
import { ChevronLeft, ChevronRight, RotateCcw, Save } from "lucide-react"

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

type Props = {
    initialDate: Date
    staff: SupportStaff[]
    shifts: SupportShift[]
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

export function SupportShiftPlanner({ initialDate, staff, shifts }: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const [currentDate, setCurrentDate] = useState(initialDate)
    const [newStaffName, setNewStaffName] = useState("")
    const activeStaff = useMemo(() => staff.filter((member) => member.active), [staff])
    const [selectedStaffId, setSelectedStaffId] = useState(activeStaff[0]?.id ?? staff[0]?.id ?? "")
    const [isSaving, setIsSaving] = useState(false)

    const [monthValue, setMonthValue] = useState(format(new Date(), "yyyy-MM"))
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

    const weekStart = useMemo(
        () => startOfWeek(currentDate, { weekStartsOn: 1 }),
        [currentDate],
    )
    const weekEnd = useMemo(
        () => endOfWeek(currentDate, { weekStartsOn: 1 }),
        [currentDate],
    )
    const weekEndExclusive = useMemo(() => addDays(weekStart, 7), [weekStart])
    const weekStartMs = weekStart.getTime()
    const weekEndExclusiveMs = weekEndExclusive.getTime()
    const days = useMemo(
        () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
        [weekStart, weekEnd],
    )

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
            const clippedStart = shiftStart.getTime() > weekStartMs ? shiftStart : new Date(weekStartMs)
            const clippedEnd = shiftEnd.getTime() < weekEndExclusiveMs ? shiftEnd : new Date(weekEndExclusiveMs)
            if (clippedEnd <= clippedStart) continue
            explodeShiftToSlots(clippedStart, clippedEnd).forEach((iso) => set.add(iso))
        }
        return set
    }, [selectedStaffId, shifts, weekStartMs, weekEndExclusiveMs])

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
                keys.add(getCellIso(day, hour, minute))
            }
        }
        return keys
    }, [currentCell, days, isPainting, startCell])

    const handleWeekMove = (offsetDays: number) => {
        const nextDate = addDays(currentDate, offsetDays)
        const dateParam = format(nextDate, "yyyy-MM-dd")
        router.push(`/teacher/support?date=${dateParam}`)
        setCurrentDate(nextDate)
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
        toast.success(`月間登録完了: 追加${result.created}件 / スキップ${result.skipped}件`)
        router.refresh()
    }

    const startPaint = (row: number, col: number) => {
        if (!selectedStaffId || isSaving) return
        const day = days[col]
        const hour = HOURS[Math.floor(row / 2)]
        const minute = row % 2 === 0 ? 0 : 30
        if (!day || hour === undefined) return
        const iso = getCellIso(day, hour, minute)
        setIsPainting(true)
        setPaintMode(draftSlots.has(iso) ? "remove" : "add")
        setStartCell({ row, col })
        setCurrentCell({ row, col })
    }

    const commitPaint = () => {
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
    }

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
    })

    const handleSaveWeek = async () => {
        if (!selectedStaffId) {
            toast.error("講師を選択してください。")
            return
        }
        setIsSaving(true)
        const result = await replaceSupportShiftsForStaffInRange({
            staffId: selectedStaffId,
            rangeStartIso: weekStart.toISOString(),
            rangeEndIso: weekEndExclusive.toISOString(),
            slotStartIsos: Array.from(draftSlots).sort(),
        })
        setIsSaving(false)
        if (!result.success) {
            toast.error(result.error || "保存に失敗しました。")
            return
        }
        toast.success("週次シフトを保存しました。")
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
                        <Button onClick={handleSaveWeek} disabled={isSaving || pendingCount === 0 || !selectedStaffId}>
                            <Save className="mr-2 h-4 w-4" />
                            {isSaving ? "保存中..." : `保存 (${pendingCount})`}
                        </Button>
                    </div>
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
                                                const iso = getCellIso(day, hour, minute)
                                                const hasBase = baseSlotSet.has(iso)
                                                const hasDraft = draftSlots.has(iso)
                                                const inRect = pendingRect.has(iso)
                                                return (
                                                    <td key={day.toISOString()} className="border-r p-0.5 last:border-r-0">
                                                        <div
                                                            data-row={rowIndex}
                                                            data-col={colIndex}
                                                            onMouseDown={(e) => {
                                                                if (e.button !== 0) return
                                                                e.preventDefault()
                                                                startPaint(rowIndex, colIndex)
                                                            }}
                                                            onMouseEnter={() => {
                                                                if (!isPainting) return
                                                                setCurrentCell({ row: rowIndex, col: colIndex })
                                                            }}
                                                            onTouchStart={() => startPaint(rowIndex, colIndex)}
                                                            className={cn(
                                                                "relative h-8 rounded border transition-colors",
                                                                hasDraft ? "border-cyan-300 bg-cyan-50" : "border-dashed border-slate-200",
                                                                inRect && paintMode === "add" && "border-emerald-300 bg-emerald-100",
                                                                inRect && paintMode === "remove" && "border-rose-300 bg-rose-100",
                                                            )}
                                                        >
                                                            {hasDraft && !inRect && <span className="text-[10px] font-semibold text-cyan-700">勤務</span>}
                                                            {inRect && paintMode === "add" && <span className="text-[10px] font-semibold text-emerald-700">追加</span>}
                                                            {inRect && paintMode === "remove" && <span className="text-[10px] font-semibold text-rose-700">削除</span>}
                                                            {!hasDraft && hasBase && !inRect && (
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
