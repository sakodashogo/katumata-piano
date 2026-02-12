"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { addDays, format, isSameDay, startOfWeek, addMinutes, setHours, setMinutes, isSameMinute } from "date-fns"
import { ja } from "date-fns/locale"
import { ChevronLeft, ChevronRight, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
    date: Date
    availableSlots: Set<string>
    unavailableSlots: Set<string>
    onBulkUpdate: (slots: string[], type: 'available' | 'unavailable' | 'neutral') => void
    onDateChange: (date: Date) => void
}

export function AvailabilityWeekView({
    date,
    availableSlots,
    unavailableSlots,
    onBulkUpdate,
    onDateChange
}: Props) {
    const startHour = 9
    const endHour = 22
    const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date, { weekStartsOn: 1 }), i))

    const timeSlots: Date[] = []
    let currentTime = setMinutes(setHours(date, startHour), 0)
    const endTime = setMinutes(setHours(date, endHour), 0)

    while (currentTime <= endTime) {
        timeSlots.push(currentTime)
        currentTime = addMinutes(currentTime, 30)
    }

    // Paint State
    const [isPainting, setIsPainting] = useState(false)
    const [paintMode, setPaintMode] = useState<'available' | 'neutral'>('available') // toggle between available and neutral (cleared)
    // For student availability, usually we toggle "Available" vs "Nothing". 
    // "Unavailable" might be explicit "NO", but usually "Not Available" is implicit.
    // However, the existing logic supports 'unavailable'.
    // Let's support: Click -> Toggle Available/Neutral. 
    // Right Click or Mode Switch -> Unavailable?
    // Let's simulate: Drag = Set to "Available". If start on "Available", Set to "Neutral".

    // Actually, let's stick to the Teacher implementation:
    // MouseDown on Empty -> Paint Available.
    // MouseDown on Available -> Paint Neutral (Clear).
    // MouseDown on Unavailable -> Paint Neutral (Clear)? Or maybe we ignore Unavailable in Paint?
    // Let's assume Paint is for "Setting Availability".

    const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set())
    const [activePaintType, setActivePaintType] = useState<'available' | 'unavailable' | 'neutral'>('available')


    // Helper to get datetime for a cell (using current week's days)
    const getCellDateTime = (day: Date, time: Date) => {
        return setMinutes(setHours(day, time.getHours()), time.getMinutes())
    }

    const handleMouseDown = (day: Date, time: Date, currentStatus: 'available' | 'unavailable' | 'neutral') => {
        setIsPainting(true)
        // If clicking on AVAILABLE, we want to CLEAR (Neutral).
        // If clicking on NEUTRAL or UNAVAILABLE, we want to set AVAILABLE.
        const targetType = currentStatus === 'available' ? 'neutral' : 'available'
        setActivePaintType(targetType)

        const iso = getCellDateTime(day, time).toISOString()
        setPendingChanges(new Set([iso]))
    }

    const handleMouseEnter = (day: Date, time: Date) => {
        if (!isPainting) return

        const iso = getCellDateTime(day, time).toISOString()
        const newPending = new Set(pendingChanges)
        newPending.add(iso)
        setPendingChanges(newPending)
    }

    const handleMouseUp = () => {
        if (!isPainting) return
        setIsPainting(false)

        if (pendingChanges.size > 0) {
            onBulkUpdate(Array.from(pendingChanges), activePaintType)
            setPendingChanges(new Set())
        }
    }

    // Global MouseUp
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isPainting) handleMouseUp()
        }
        window.addEventListener('mouseup', handleGlobalMouseUp)
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }, [isPainting, pendingChanges, activePaintType])

    const navigateWeek = (direction: 'prev' | 'next') => {
        const newDate = addDays(date, direction === 'next' ? 7 : -7)
        onDateChange(newDate)
    }

    return (
        <div className="space-y-4 select-none">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <div className="flex items-center text-xs gap-3 mr-4">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded"></div>希望</div>
                        {/* <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded"></div>不可</div> */}
                        <div className="flex items-center gap-1"><div className="w-3 h-3 border border-slate-300 rounded"></div>未設定</div>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">
                        <PenLine className="h-3 w-3" />
                        <span>ドラッグで連続設定</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-medium text-slate-900">
                        {format(days[0], "M月d日", { locale: ja })} - {format(days[6], "M月d日", { locale: ja })}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div
                className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
                onMouseLeave={handleMouseUp}
            >
                <table className="w-full min-w-[800px] text-center text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr>
                            <th className="w-20 px-4 py-3 font-medium sticky left-0 bg-slate-50 z-10">時間</th>
                            {days.map((day) => (
                                <th key={day.toString()} className="px-4 py-3 font-medium min-w-[100px]">
                                    <div className="flex flex-col">
                                        <span className="text-xs">{format(day, "E", { locale: ja })}</span>
                                        <span className="text-lg text-slate-900">{format(day, "d")}</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {timeSlots.map((time) => (
                            <tr key={time.toString()}>
                                <td className="w-20 border-r border-slate-100 px-4 py-2 text-xs font-medium text-slate-400 sticky left-0 bg-white z-10">
                                    {format(time, "HH:mm")}
                                </td>
                                {days.map((day) => {
                                    const cellDateTime = getCellDateTime(day, time)
                                    const iso = cellDateTime.toISOString()

                                    const isAvailable = availableSlots.has(iso)
                                    const isUnavailable = unavailableSlots.has(iso)

                                    let status: 'available' | 'unavailable' | 'neutral' = 'neutral'
                                    if (isAvailable) status = 'available'
                                    else if (isUnavailable) status = 'unavailable'

                                    const isPendingChange = pendingChanges.has(iso)

                                    // Visual Logic
                                    let visualState = status
                                    if (isPendingChange) {
                                        visualState = activePaintType
                                    }

                                    return (
                                        <td key={day.toString()} className="border-r border-slate-100 p-0 last:border-0 h-14 relative group">
                                            <div
                                                onMouseDown={(e) => {
                                                    if (e.button === 0) handleMouseDown(day, time, status)
                                                }}
                                                onMouseEnter={() => handleMouseEnter(day, time)}
                                                className={cn(
                                                    "w-full h-full flex items-center justify-center transition-colors duration-75 cursor-pointer select-none",
                                                    visualState === 'available'
                                                        ? "bg-green-500 text-white"
                                                        : visualState === 'unavailable'
                                                            ? "bg-red-500 text-white"
                                                            : "hover:bg-slate-50"
                                                )}
                                            >
                                                {visualState === 'available' ? (
                                                    <span className="text-xs font-bold">◯</span>
                                                ) : visualState === 'unavailable' ? (
                                                    <span className="text-xs font-bold">✕</span>
                                                ) : (
                                                    <div className="w-full h-full" />
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
        </div>
    )
}
