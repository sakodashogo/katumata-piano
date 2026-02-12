"use client"

import { useState, useMemo } from "react"
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, setHours, setMinutes } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROOMS } from "@/lib/constants"

type Menu = {
    id: string
    name: string
    durationMin: number
}

type SlotWithMenu = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    isPublic: boolean
    menuId: string | null
    durationMin: number
    menu: Menu | null
}

type Props = {
    slots: SlotWithMenu[]
    year: number
    month: number
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9) // 9:00 - 21:00
const CELL_HEIGHT = 48 // px per 30-min cell
const TOTAL_MINUTES = 12 * 60 // 9:00-21:00 = 720 minutes

function getStatusLabel(slot: SlotWithMenu): string {
    if (slot.isBooked) return "予約済み"
    if (slot.isPublic) return "公開中"
    return "下書き"
}

function getStatusStyle(slot: SlotWithMenu): string {
    if (slot.isBooked) return "bg-green-100 border-green-400 text-green-800"
    if (slot.isPublic) return "bg-blue-50 border-blue-400 text-blue-800"
    return "bg-amber-50 border-amber-300 border-dashed text-amber-800"
}

export function SlotTimeline({ slots, year, month }: Props) {
    const monthStart = startOfMonth(new Date(year, month - 1))
    const monthEnd = endOfMonth(monthStart)
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

    const [selectedDate, setSelectedDate] = useState<Date>(
        daysInMonth.find(d => isSameDay(d, new Date())) || monthStart
    )

    const navigateDay = (delta: number) => {
        const next = addDays(selectedDate, delta)
        if (next >= monthStart && next <= monthEnd) {
            setSelectedDate(next)
        }
    }

    // Slots for the selected date, grouped by room
    const daySlotsA = useMemo(
        () => slots.filter(s => s.roomId === "A" && isSameDay(new Date(s.startTime), selectedDate)),
        [slots, selectedDate]
    )
    const daySlotsB = useMemo(
        () => slots.filter(s => s.roomId === "B" && isSameDay(new Date(s.startTime), selectedDate)),
        [slots, selectedDate]
    )

    // Mini calendar for quick date selection
    const weeksInMonth = useMemo(() => {
        const weeks: Date[][] = []
        let currentWeek: Date[] = []
        const firstDayOfWeek = monthStart.getDay() // 0=Sunday
        // Pad start
        for (let i = 0; i < (firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1); i++) {
            currentWeek.push(addDays(monthStart, -(firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1) + i))
        }
        for (const day of daysInMonth) {
            currentWeek.push(day)
            if (currentWeek.length === 7) {
                weeks.push(currentWeek)
                currentWeek = []
            }
        }
        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) currentWeek.push(addDays(monthEnd, currentWeek.length - (currentWeek.length - 1)))
            weeks.push(currentWeek)
        }
        return weeks
    }, [daysInMonth, monthStart, monthEnd])

    // Count slots per day for the mini calendar
    const slotCountByDay = useMemo(() => {
        const map = new Map<string, number>()
        for (const slot of slots) {
            const key = format(new Date(slot.startTime), "yyyy-MM-dd")
            map.set(key, (map.get(key) || 0) + 1)
        }
        return map
    }, [slots])

    return (
        <div className="space-y-4">
            {/* Mini Calendar */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                    {["月", "火", "水", "木", "金", "土", "日"].map(d => (
                        <div key={d} className="font-medium text-slate-500 py-1">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {daysInMonth.length > 0 && (() => {
                        // Calculate padding for Monday-start week
                        const firstDay = monthStart.getDay()
                        const pad = firstDay === 0 ? 6 : firstDay - 1
                        const cells: React.ReactNode[] = []
                        for (let i = 0; i < pad; i++) {
                            cells.push(<div key={`pad-${i}`} />)
                        }
                        for (const day of daysInMonth) {
                            const key = format(day, "yyyy-MM-dd")
                            const count = slotCountByDay.get(key) || 0
                            const isSelected = isSameDay(day, selectedDate)
                            const isToday = isSameDay(day, new Date())
                            cells.push(
                                <button
                                    key={key}
                                    onClick={() => setSelectedDate(day)}
                                    className={cn(
                                        "relative aspect-square rounded-lg text-sm flex flex-col items-center justify-center transition-all",
                                        isSelected
                                            ? "bg-blue-600 text-white"
                                            : isToday
                                                ? "bg-blue-50 text-blue-700 font-bold"
                                                : "hover:bg-slate-100 text-slate-700"
                                    )}
                                >
                                    {format(day, "d")}
                                    {count > 0 && (
                                        <div className={cn(
                                            "absolute bottom-0.5 w-1.5 h-1.5 rounded-full",
                                            isSelected ? "bg-white" : "bg-blue-500"
                                        )} />
                                    )}
                                </button>
                            )
                        }
                        return cells
                    })()}
                </div>
            </div>

            {/* Day navigation */}
            <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
                <Button variant="ghost" size="sm" onClick={() => navigateDay(-1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> 前日
                </Button>
                <span className="font-bold text-lg text-slate-900">
                    {format(selectedDate, "M月d日 (E)", { locale: ja })}
                </span>
                <Button variant="ghost" size="sm" onClick={() => navigateDay(1)}>
                    翌日 <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* Legend */}
                <div className="flex items-center gap-4 p-3 border-b text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-amber-50 border border-dashed border-amber-300 rounded-sm" />
                        下書き
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-50 border border-blue-400 rounded-sm" />
                        公開中
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-100 border border-green-400 rounded-sm" />
                        予約済み
                    </div>
                </div>

                <ScrollArea className="h-[calc(100vh-500px)] min-h-[400px]">
                    <div className="grid grid-cols-[60px_1fr_1fr] min-h-full">
                        {/* Header */}
                        <div className="sticky top-0 z-10 bg-slate-50 border-b p-2 text-xs font-medium text-slate-500 text-center">
                            時間
                        </div>
                        <div className="sticky top-0 z-10 bg-slate-50 border-b border-l p-2 text-xs font-medium text-slate-600 text-center">
                            {ROOMS.A.name}
                        </div>
                        <div className="sticky top-0 z-10 bg-slate-50 border-b border-l p-2 text-xs font-medium text-slate-600 text-center">
                            {ROOMS.B.name}
                        </div>

                        {/* Time grid */}
                        <div className="border-r">
                            {HOURS.map(hour => (
                                <div key={hour}>
                                    <div className="h-[48px] flex items-start justify-end pr-2 pt-1 text-xs text-slate-400 font-mono border-b">
                                        {hour}:00
                                    </div>
                                    <div className="h-[48px] flex items-start justify-end pr-2 pt-1 text-xs text-slate-300 font-mono border-b border-dashed">
                                        {hour}:30
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Room A column */}
                        <TimelineColumn
                            slots={daySlotsA}
                            selectedDate={selectedDate}
                        />

                        {/* Room B column */}
                        <TimelineColumn
                            slots={daySlotsB}
                            selectedDate={selectedDate}
                        />
                    </div>
                </ScrollArea>
            </div>
        </div>
    )
}

function TimelineColumn({ slots, selectedDate }: { slots: SlotWithMenu[]; selectedDate: Date }) {
    const dayStart = setMinutes(setHours(selectedDate, 9), 0)

    return (
        <div className="border-l relative">
            {/* Background grid lines */}
            {HOURS.map(hour => (
                <div key={hour}>
                    <div className="h-[48px] border-b" />
                    <div className="h-[48px] border-b border-dashed" />
                </div>
            ))}

            {/* Slot blocks positioned absolutely */}
            {slots.map(slot => {
                const startMin = (slot.startTime.getTime() - dayStart.getTime()) / (1000 * 60)
                const durationMin = (slot.endTime.getTime() - slot.startTime.getTime()) / (1000 * 60)
                const top = (startMin / 30) * CELL_HEIGHT
                const height = (durationMin / 30) * CELL_HEIGHT

                if (startMin < 0 || startMin >= TOTAL_MINUTES) return null

                return (
                    <div
                        key={slot.id}
                        className={cn(
                            "absolute left-1 right-1 rounded-md border px-2 py-1 text-xs overflow-hidden",
                            getStatusStyle(slot)
                        )}
                        style={{ top: `${top}px`, height: `${Math.max(height - 2, 20)}px` }}
                    >
                        <div className="font-medium truncate">
                            {slot.menu?.name || "メニュー未設定"}
                        </div>
                        {height >= 40 && (
                            <div className="text-[10px] opacity-70">
                                {format(slot.startTime, "HH:mm")}-{format(slot.endTime, "HH:mm")} / {getStatusLabel(slot)}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
