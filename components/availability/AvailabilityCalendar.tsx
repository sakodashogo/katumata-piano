"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    format,
    addDays,
    startOfWeek,
    setHours,
    setMinutes,
    startOfDay,
    addMonths,
    subMonths,
    endOfMonth,
} from "date-fns"
import { ja } from "date-fns/locale"
import { Loader2, ChevronLeft, ChevronRight, PenLine, CheckCheck, Eraser, Copy } from "lucide-react"
import { isWithinTeacherWorkingHours, type TeacherWorkingHoursByDay } from "@/lib/teacher-working-hours"

type AvailabilityCalendarProps = {
    initialAvailableSlots: string[]
    initialUnavailableSlots: string[]
    year: number
    month: number
    workingHours: TeacherWorkingHoursByDay
    onSave: (year: number, month: number, data: { availableSlots: string[], unavailableSlots: string[] }) => Promise<{ success: boolean, error?: string }>
    onMonthChange: (year: number, month: number) => void
    readOnly?: boolean
}

const START_HOUR = 9
const END_HOUR = 22

type CellPos = { row: number; col: number }

function filterSlotsByWorkingHours(slotIsos: string[], workingHours: TeacherWorkingHoursByDay) {
    const unique = new Set<string>()
    const filtered: string[] = []
    for (const value of slotIsos) {
        const slotStart = new Date(value)
        if (Number.isNaN(slotStart.getTime())) continue
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000)
        if (!isWithinTeacherWorkingHours(workingHours, slotStart, slotEnd)) continue
        const iso = slotStart.toISOString()
        if (unique.has(iso)) continue
        unique.add(iso)
        filtered.push(iso)
    }
    return filtered
}

export function AvailabilityCalendar({
    initialAvailableSlots,
    initialUnavailableSlots,
    year,
    month,
    workingHours,
    onSave,
    onMonthChange,
    readOnly = false
}: AvailabilityCalendarProps) {
    const monthStart = new Date(year, month - 1, 1)

    const [weekStart, setWeekStart] = React.useState(() =>
        startOfWeek(monthStart, { weekStartsOn: 1 })
    )

    React.useEffect(() => {
        setWeekStart(startOfWeek(new Date(year, month - 1, 1), { weekStartsOn: 1 }))
    }, [year, month])

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

    // Slot state
    const [availableSlots, setAvailableSlots] = React.useState<Set<string>>(
        () => new Set(filterSlotsByWorkingHours(initialAvailableSlots, workingHours))
    )
    const [unavailableSlots, setUnavailableSlots] = React.useState<Set<string>>(
        () => new Set(filterSlotsByWorkingHours(initialUnavailableSlots, workingHours))
    )
    const [isSaving, setIsSaving] = React.useState(false)

    React.useEffect(() => {
        setAvailableSlots(new Set(filterSlotsByWorkingHours(initialAvailableSlots, workingHours)))
        setUnavailableSlots(new Set(filterSlotsByWorkingHours(initialUnavailableSlots, workingHours)))
    }, [initialAvailableSlots, initialUnavailableSlots, month, workingHours, year])

    // --- Rectangle-based drag state ---
    const isPaintingRef = React.useRef(false)
    const paintTypeRef = React.useRef<'available' | 'neutral'>('available')
    const startCellRef = React.useRef<CellPos | null>(null)
    const currentCellRef = React.useRef<CellPos | null>(null)
    const [, forceRender] = React.useState(0)
    const rerender = () => forceRender(c => c + 1)

    const gridRef = React.useRef<HTMLDivElement>(null)

    // Keep refs to latest values for use in event handlers (avoids stale closures)
    const daysRef = React.useRef(days)
    daysRef.current = days
    const timeSlotsRef = React.useRef(timeSlots)
    timeSlotsRef.current = timeSlots
    const availableSlotsRef = React.useRef(availableSlots)
    availableSlotsRef.current = availableSlots

    const getCellIso = (day: Date, hour: number, minute: number) =>
        setMinutes(setHours(startOfDay(day), hour), minute).toISOString()

    const isWorkingHourCell = React.useCallback((day: Date, hour: number, minute: number) => {
        const slotStart = setMinutes(setHours(startOfDay(day), hour), minute)
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000)
        return isWithinTeacherWorkingHours(workingHours, slotStart, slotEnd)
    }, [workingHours])

    const getSlotStatus = React.useCallback((iso: string): 'available' | 'unavailable' | 'neutral' => {
        if (availableSlots.has(iso)) return 'available'
        if (unavailableSlots.has(iso)) return 'unavailable'
        return 'neutral'
    }, [availableSlots, unavailableSlots])

    const isDayInMonth = (day: Date) =>
        day.getMonth() === month - 1 && day.getFullYear() === year

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
                if (
                    day.getMonth() === month - 1 &&
                    day.getFullYear() === year &&
                    isWorkingHourCell(day, slot.hour, slot.minute)
                ) {
                    result.push(getCellIso(day, slot.hour, slot.minute))
                }
            }
        }
        return result
    }, [isWorkingHourCell, month, year])

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

        setAvailableSlots(prev => {
            const next = new Set(prev)
            isos.forEach(iso => {
                if (paintType === 'available') {
                    next.add(iso)
                } else {
                    next.delete(iso)
                }
            })
            return next
        })
        setUnavailableSlots(prev => {
            const next = new Set(prev)
            isos.forEach(iso => {
                next.delete(iso)
            })
            return next
        })

        startCellRef.current = null
        currentCellRef.current = null
        rerender()
    }, [getRectIsos])

    const handleCellStart = React.useCallback((row: number, col: number) => {
        if (readOnly) return
        const day = daysRef.current[col]
        const slot = timeSlotsRef.current[row]
        if (!day || !slot) return
        if (!isWorkingHourCell(day, slot.hour, slot.minute)) return
        const iso = getCellIso(day, slot.hour, slot.minute)

        isPaintingRef.current = true
        paintTypeRef.current = availableSlotsRef.current.has(iso) ? 'neutral' : 'available'
        startCellRef.current = { row, col }
        currentCellRef.current = { row, col }
        rerender()
    }, [isWorkingHourCell, readOnly])

    const updateCurrentCell = React.useCallback((row: number, col: number) => {
        if (!isPaintingRef.current || readOnly) return
        const current = currentCellRef.current
        if (current && current.row === row && current.col === col) return
        currentCellRef.current = { row, col }
        rerender()
    }, [readOnly])

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

    // Touch move: find cell under finger using data-row / data-col
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

    // Batch actions
    const batchSetWeek = (type: 'available' | 'neutral') => {
        const newAvailable = new Set(availableSlots)
        const newUnavailable = new Set(unavailableSlots)
        days.forEach(day => {
            if (!isDayInMonth(day)) return
            timeSlots.forEach(({ hour, minute }) => {
                if (!isWorkingHourCell(day, hour, minute)) return
                const iso = getCellIso(day, hour, minute)
                if (type === 'available') {
                    newAvailable.add(iso)
                    newUnavailable.delete(iso)
                } else {
                    newAvailable.delete(iso)
                    newUnavailable.delete(iso)
                }
            })
        })
        setAvailableSlots(newAvailable)
        setUnavailableSlots(newUnavailable)
    }

    const applyWeekToMonth = () => {
        const newAvailable = new Set(availableSlots)
        const newUnavailable = new Set(unavailableSlots)

        const weekPattern = new Map<number, Map<string, boolean>>()
        days.forEach(day => {
            const dayPattern = new Map<string, boolean>()
            timeSlots.forEach(({ hour, minute }) => {
                const iso = getCellIso(day, hour, minute)
                if (isWorkingHourCell(day, hour, minute)) {
                    dayPattern.set(`${hour}:${minute}`, availableSlots.has(iso))
                } else {
                    dayPattern.set(`${hour}:${minute}`, false)
                }
            })
            weekPattern.set(day.getDay(), dayPattern)
        })

        let d = new Date(year, month - 1, 1)
        const end = endOfMonth(d)
        while (d <= end) {
            const dayPattern = weekPattern.get(d.getDay())
            if (dayPattern) {
                timeSlots.forEach(({ hour, minute }) => {
                    if (!isWorkingHourCell(d, hour, minute)) return
                    const iso = getCellIso(d, hour, minute)
                    if (dayPattern.get(`${hour}:${minute}`)) {
                        newAvailable.add(iso)
                        newUnavailable.delete(iso)
                    } else {
                        newAvailable.delete(iso)
                        newUnavailable.delete(iso)
                    }
                })
            }
            d = addDays(d, 1)
        }

        setAvailableSlots(newAvailable)
        setUnavailableSlots(newUnavailable)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await onSave(year, month, {
                availableSlots: Array.from(availableSlots),
                unavailableSlots: Array.from(unavailableSlots)
            })
        } finally {
            setIsSaving(false)
        }
    }

    const navigateWeek = (direction: 'prev' | 'next') => {
        setWeekStart(prev => addDays(prev, direction === 'next' ? 7 : -7))
    }

    const getVisualState = (
        iso: string,
        row: number,
        col: number,
        day: Date,
        hour: number,
        minute: number
    ): 'available' | 'unavailable' | 'neutral' | 'outside' => {
        if (!isWorkingHourCell(day, hour, minute)) {
            return 'outside'
        }
        if (isInPendingRect(row, col)) {
            return paintTypeRef.current === 'available' ? 'available' : 'neutral'
        }
        return getSlotStatus(iso)
    }

    const monthAvailableCount = React.useMemo(() => {
        let count = 0
        availableSlots.forEach(iso => {
            const d = new Date(iso)
            if (d.getFullYear() === year && d.getMonth() === month - 1) count++
        })
        return count
    }, [availableSlots, year, month])

    return (
        <div className="flex flex-col gap-3 select-none">
            {/* Month Navigation */}
            <div className="flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={() => {
                    const d = subMonths(new Date(year, month - 1), 1)
                    onMonthChange(d.getFullYear(), d.getMonth() + 1)
                }}>
                    <ChevronLeft className="h-4 w-4" />
                    前月
                </Button>
                <div className="text-lg font-bold">{year}年 {month}月</div>
                <Button variant="outline" size="sm" onClick={() => {
                    const d = addMonths(new Date(year, month - 1), 1)
                    onMonthChange(d.getFullYear(), d.getMonth() + 1)
                }}>
                    次月
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            {/* Week Navigation + Legend */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
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

                <div className="flex items-center text-xs gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-green-500" />
                        <span>希望</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded border border-slate-300" />
                        <span>未設定</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
                        <span>営業時間外</span>
                    </div>
                    {!readOnly && (
                        <div className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            <PenLine className="h-3 w-3" />
                            <span>ドラッグで範囲選択</span>
                        </div>
                    )}
                    <div className="text-slate-500">
                        今月: {monthAvailableCount}コマ設定済
                    </div>
                </div>
            </div>

            {/* Batch Actions */}
            {!readOnly && (
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => batchSetWeek('available')}>
                        <CheckCheck className="h-3.5 w-3.5 mr-1" />
                        この週を全て希望
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batchSetWeek('neutral')}>
                        <Eraser className="h-3.5 w-3.5 mr-1" />
                        この週をクリア
                    </Button>
                    <Button size="sm" variant="secondary" onClick={applyWeekToMonth}>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        この週のパターンを月全体に適用
                    </Button>
                </div>
            )}

            {/* Grid */}
            <div
                ref={gridRef}
                className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
                onMouseLeave={() => commitPaint()}
            >
                <table className="w-full min-w-[540px] text-center text-sm border-collapse">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0 z-20">
                        <tr>
                            <th className="w-14 px-1 py-2 text-xs font-medium sticky left-0 bg-slate-50 z-30 border-r border-slate-200">
                                時間
                            </th>
                            {days.map(day => {
                                const inMonth = isDayInMonth(day)
                                const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                                const isSun = day.getDay() === 0
                                const isSat = day.getDay() === 6
                                return (
                                    <th
                                        key={day.toISOString()}
                                        className={cn(
                                            "px-0 py-1.5 font-medium min-w-[68px] border-r border-slate-200 last:border-r-0",
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
                                                isToday && "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
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
                                    "w-14 px-1 py-0 text-[11px] font-medium text-slate-400 sticky left-0 bg-white z-10 border-r border-slate-200",
                                    minute === 30 && "text-slate-300"
                                )}>
                                    {minute === 0 ? label : ""}
                                </td>
                                {days.map((day, colIndex) => {
                                    const iso = getCellIso(day, hour, minute)
                                    const inMonth = isDayInMonth(day)
                                    const visual = getVisualState(iso, rowIndex, colIndex, day, hour, minute)
                                    const isOutside = visual === "outside"

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
                                                    if (e.button === 0 && inMonth && !isOutside) handleCellStart(rowIndex, colIndex)
                                                }}
                                                onMouseEnter={() => {
                                                    if (inMonth && !isOutside) updateCurrentCell(rowIndex, colIndex)
                                                }}
                                                onTouchStart={() => {
                                                    if (inMonth && !isOutside) handleCellStart(rowIndex, colIndex)
                                                }}
                                                className={cn(
                                                    "w-full h-[28px] flex items-center justify-center transition-colors duration-75",
                                                    !inMonth && "bg-slate-50 opacity-30",
                                                    inMonth && !readOnly && !isOutside && "cursor-pointer",
                                                    inMonth && isOutside && "cursor-default bg-slate-100/80 text-slate-400",
                                                    inMonth && visual === 'available' && "bg-green-500 text-white",
                                                    inMonth && visual === 'unavailable' && "bg-red-400 text-white",
                                                    inMonth && visual === 'neutral' && !readOnly && "hover:bg-green-50",
                                                )}
                                            >
                                                {inMonth && visual === 'available' && (
                                                    <span className="text-[10px] font-bold leading-none">◯</span>
                                                )}
                                                {inMonth && isOutside && (
                                                    <span className="text-[9px] font-semibold leading-none">対象外</span>
                                                )}
                                            </div>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Save Button */}
            {!readOnly && (
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        保存する
                    </Button>
                </div>
            )}
        </div>
    )
}
