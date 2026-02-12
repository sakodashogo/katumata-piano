"use client"

import { useState, useTransition } from "react"
import { toggleOpenSlot } from "@/app/lib/actions/schedule"
import { cn } from "@/lib/utils"
import { addDays, format, isSameDay, startOfWeek, addMinutes, setHours, setMinutes, isSameMinute } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

type OpenSlot = {
    id: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    roomId: string
}

export function WeeklySchedule({
    roomId,
    date,
    slots,
}: {
    roomId: string
    date: Date
    slots: OpenSlot[]
}) {
    const router = useRouter()
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

    const handleToggle = async (day: Date, time: Date) => {
        const cellDateTime = setMinutes(setHours(day, time.getHours()), time.getMinutes())
        startTransition(async () => {
            await toggleOpenSlot(roomId, cellDateTime.toISOString())
        })
    }

    const navigateWeek = (direction: 'prev' | 'next') => {
        const newDate = addDays(date, direction === 'next' ? 7 : -7)
        router.push(`?room=${roomId}&date=${newDate.toISOString().split('T')[0]}`)
    }

    const switchRoom = (newRoom: string) => {
        router.push(`?room=${newRoom}&date=${date.toISOString().split('T')[0]}`)
    }

    return (
        <div className="space-y-4">
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
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[800px] text-center text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr>
                            <th className="w-20 px-4 py-3 font-medium">時間</th>
                            {days.map((day) => (
                                <th key={day.toString()} className="px-4 py-3 font-medium">
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
                                <td className="w-20 border-r border-slate-100 px-4 py-2 text-xs font-medium text-slate-400">
                                    {format(time, "HH:mm")}
                                </td>
                                {days.map((day) => {
                                    const cellDateTime = setMinutes(setHours(day, time.getHours()), time.getMinutes())
                                    const slot = slots.find(s => isSameDay(new Date(s.startTime), day) && isSameMinute(new Date(s.startTime), cellDateTime))

                                    const isOpen = !!slot
                                    const isBooked = slot?.isBooked || false

                                    return (
                                        <td key={day.toString()} className="border-r border-slate-100 p-1 last:border-0">
                                            <button
                                                onClick={() => handleToggle(day, time)}
                                                disabled={isBooked || isPending}
                                                className={cn(
                                                    "h-10 w-full rounded-md transition-all duration-200 text-xs font-medium",
                                                    isBooked
                                                        ? "bg-red-100 text-red-700 cursor-not-allowed border border-red-200"
                                                        : isOpen
                                                            ? "bg-blue-500 hover:bg-blue-600 text-white shadow-sm"
                                                            : "hover:bg-slate-100 text-transparent hover:text-slate-400"
                                                )}
                                            >
                                                {isBooked ? "予約済" : isOpen ? "空き" : "+"}
                                            </button>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isPending && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    保存中...
                </div>
            )}
        </div>
    )
}
