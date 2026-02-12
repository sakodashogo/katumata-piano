"use client"

import { useState, useTransition, useEffect } from "react"
import { bulkUpdateOpenSlots } from "@/app/lib/actions/schedule"
import { cn } from "@/lib/utils"
import { addDays, format, isSameDay, startOfWeek, addMinutes, setHours, setMinutes, isSameMinute } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Loader2, Eraser, PenLine } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"

type OpenSlot = {
    id: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    roomId: string
}

type Lesson = {
    id: string
    startTime: Date
    endTime: Date
    status: string
    roomId: string
}

export function WeeklySchedule({
    roomId,
    date,
    slots,
    lessons
}: {
    roomId: string
    date: Date
    slots: OpenSlot[]
    lessons: Lesson[]
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    const startHour = 10
    const endHour = 20
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
    const [paintMode, setPaintMode] = useState<'add' | 'remove'>('add')
    const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set())

    // Helper to get datetime for a cell
    const getCellDateTime = (day: Date, time: Date) => {
        return setMinutes(setHours(day, time.getHours()), time.getMinutes())
    }

    const handleMouseDown = (day: Date, time: Date, currentStatus: 'open' | 'closed' | 'booked') => {
        if (currentStatus === 'booked') return

        setIsPainting(true)
        // If clicking on OPEN, mode is REMOVE. If CLOSED, mode is ADD.
        const mode = currentStatus === 'open' ? 'remove' : 'add'
        setPaintMode(mode)

        const iso = getCellDateTime(day, time).toISOString()
        setPendingChanges(new Set([iso]))
    }

    const handleMouseEnter = (day: Date, time: Date, currentStatus: 'open' | 'closed' | 'booked') => {
        if (!isPainting || currentStatus === 'booked') return

        const iso = getCellDateTime(day, time).toISOString()
        const newPending = new Set(pendingChanges)

        // If mode is ADD, we want to ensure this slot is in pending if it was closed
        // But simpler: just add to pending set. The Set represents "Slots to Apply Mode To".
        newPending.add(iso)
        setPendingChanges(newPending)
    }

    const handleMouseUp = async () => {
        if (!isPainting) return
        setIsPainting(false)

        if (pendingChanges.size === 0) return

        const slotsToUpdate = Array.from(pendingChanges)
        // Optimistic UI could be handled here but we rely on revalidatePath for simplicity + toast
        startTransition(async () => {
            const result = await bulkUpdateOpenSlots(roomId, slotsToUpdate, paintMode)
            if (result.success) {
                // Toast is annoying if used frequently? Maybe subtle?
                // toast.success(paintMode === 'add' ? "空き枠を設定しました" : "空き枠を解除しました")
                setPendingChanges(new Set())
            } else {
                toast.error("更新に失敗しました")
                setPendingChanges(new Set()) // Clear on fail or keep? Clear to avoid stuck state
            }
        })
    }

    // Global MouseUp to catch releases outside the grid
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isPainting) handleMouseUp()
        }
        window.addEventListener('mouseup', handleGlobalMouseUp)
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }, [isPainting, pendingChanges, paintMode]) // Dependencies needed for closure

    const navigateWeek = (direction: 'prev' | 'next') => {
        const newDate = addDays(date, direction === 'next' ? 7 : -7)
        router.push(`?room=${roomId}&date=${newDate.toISOString().split('T')[0]}`)
    }

    const switchRoom = (newRoom: string) => {
        router.push(`?room=${newRoom}&date=${date.toISOString().split('T')[0]}`)
    }

    return (
        <div className="space-y-4 select-none">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => switchRoom("A")}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-all",
                            roomId === "A" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-900"
                        )}
                    >
                        A教室
                    </button>
                    <button
                        onClick={() => switchRoom("B")}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-all",
                            roomId === "B" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-900"
                        )}
                    >
                        B教室
                    </button>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center text-xs gap-3 mr-4">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded"></div>空き枠</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>予約済</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 border border-slate-300 rounded"></div>未設定</div>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">
                        <PenLine className="h-3 w-3" />
                        <span>ドラッグで連続設定</span>
                    </div>

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

            {/* Schedule Grid */}
            <div
                className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
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

                                    const slot = slots.find(s => isSameDay(new Date(s.startTime), day) && isSameMinute(new Date(s.startTime), cellDateTime))
                                    const lesson = lessons.find(l => isSameDay(new Date(l.startTime), day) && isSameMinute(new Date(l.startTime), cellDateTime))

                                    const isOpen = !!slot
                                    const isBooked = slot?.isBooked || false
                                    const isLesson = !!lesson

                                    const isPendingChange = pendingChanges.has(iso)

                                    // Visual State Logic
                                    // If pending change says this slot is affected by current Paint Mode:
                                    //   If PaintMode is ADD -> Show Blue (even if currently closed)
                                    //   If PaintMode is REMOVE -> Show Empty/White (even if currently open)

                                    let visualState = 'closed'
                                    if (isLesson) visualState = 'lesson'
                                    else if (isBooked) visualState = 'booked'
                                    else if (isOpen) visualState = 'open'

                                    if (isPendingChange && !isBooked && !isLesson) {
                                        if (paintMode === 'add') visualState = 'open'
                                        else visualState = 'closed'
                                    }

                                    return (
                                        <td key={day.toString()} className="border-r border-slate-100 p-0 last:border-0 h-14 relative group">
                                            <div
                                                onMouseDown={(e) => {
                                                    if (e.button === 0) handleMouseDown(day, time, isBooked ? 'booked' : isOpen ? 'open' : 'closed')
                                                }}
                                                onMouseEnter={() => handleMouseEnter(day, time, isBooked ? 'booked' : isOpen ? 'open' : 'closed')}
                                                className={cn(
                                                    "w-full h-full flex items-center justify-center transition-colors duration-75 cursor-pointer select-none",
                                                    isLesson
                                                        ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                                                        : isBooked
                                                            ? "bg-red-100 text-red-700 cursor-not-allowed"
                                                            : visualState === 'open'
                                                                ? "bg-blue-500 text-white"
                                                                : "hover:bg-slate-50"
                                                )}
                                            >
                                                {isLesson ? (
                                                    <span className="text-xs">L</span>
                                                ) : isBooked ? (
                                                    <span className="text-xs font-bold">予約済</span>
                                                ) : visualState === 'open' ? (
                                                    <span className="text-xs font-bold">空き</span>
                                                ) : (
                                                    // Empty
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
            {isPending && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg z-50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    保存中...
                </div>
            )}
        </div>
    )
}
