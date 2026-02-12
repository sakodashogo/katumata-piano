"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { format, addDays, startOfToday, isSameDay } from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
    Calendar as CalendarIcon,
    ArrowRight,
} from "lucide-react"

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
const ROOMS = ["A", "B"] as const

type OpenSlot = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    isPublic: boolean
}

type Props = {
    initialSlots: Array<{
        id: string
        roomId: string
        startTime: Date | string
        endTime: Date | string
        isBooked: boolean
        isPublic: boolean
    }>
    year: number
    month: number
}

export function ResourceManager({ initialSlots, year, month }: Props) {
    const [selectedDate, setSelectedDate] = useState(startOfToday())

    const slots = useMemo<OpenSlot[]>(
        () =>
            initialSlots.map((slot) => ({
                ...slot,
                startTime: new Date(slot.startTime),
                endTime: new Date(slot.endTime),
            })),
        [initialSlots]
    )

    const filteredSlots = useMemo(
        () => slots.filter((slot) => isSameDay(slot.startTime, selectedDate)),
        [selectedDate, slots]
    )

    const draftCount = filteredSlots.filter((slot) => !slot.isBooked && !slot.isPublic).length
    const publicCount = filteredSlots.filter((slot) => !slot.isBooked && slot.isPublic).length
    const bookedCount = filteredSlots.filter((slot) => slot.isBooked).length

    return (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
            <div className="space-y-6">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 font-bold">
                            <CalendarIcon className="h-4 w-4 text-blue-500" />
                            日付選択
                        </h2>
                        <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="mb-4 rounded-lg bg-slate-50 py-2 text-center">
                        <span className="text-2xl font-black text-slate-800">
                            {format(selectedDate, "M月 d日", { locale: ja })}
                        </span>
                        <span className="ml-2 text-slate-500">({format(selectedDate, "EEEE", { locale: ja })})</span>
                    </div>

                    <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between rounded-lg border bg-amber-50 px-3 py-2 text-amber-800">
                            <span>下書き</span>
                            <span className="font-bold">{draftCount}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border bg-blue-50 px-3 py-2 text-blue-800">
                            <span>公開中</span>
                            <span className="font-bold">{publicCount}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border bg-green-50 px-3 py-2 text-green-800">
                            <span>予約済み</span>
                            <span className="font-bold">{bookedCount}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <h3 className="text-sm font-bold text-blue-900">編集は専用画面で実施</h3>
                    <p className="text-xs text-blue-800">
                        この画面は2部屋の稼働状況を素早く確認するための可視化画面です。空き枠の作成・公開は専用画面から操作してください。
                    </p>
                    <div className="space-y-2">
                        <Link href={`/teacher/schedule?date=${format(selectedDate, "yyyy-MM-dd")}`} className="block">
                            <Button className="w-full justify-between" variant="outline">
                                週次スケジュールへ
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href={`/teacher/slots?year=${year}&month=${month}`} className="block">
                            <Button className="w-full justify-between bg-blue-600 text-white hover:bg-blue-700">
                                空き枠承認へ
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="flex h-[700px] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div className="grid grid-cols-[80px_1fr_1fr] border-b bg-slate-100">
                    <div className="border-r p-4" />
                    {ROOMS.map((room) => (
                        <div key={room} className="flex items-center justify-center gap-2 border-r p-4 text-center font-bold text-slate-700 last:border-r-0">
                            <LayoutGrid className="h-4 w-4 text-slate-400" />
                            ピアノ室 {room}
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="grid min-h-full grid-cols-[80px_1fr_1fr]">
                        <div className="border-r bg-slate-50">
                            {HOURS.map((hour) => (
                                <div key={hour} className="flex h-24 flex-col justify-between border-b p-2 font-mono text-[10px] italic text-slate-400">
                                    <span>{hour}:00</span>
                                    <span className="opacity-50">{hour}:30</span>
                                </div>
                            ))}
                        </div>

                        {ROOMS.map((room) => (
                            <div key={room} className="relative border-r bg-slate-50/30 last:border-r-0">
                                {HOURS.map((hour) => (
                                    <div key={hour} className="h-24 border-b" />
                                ))}

                                {filteredSlots
                                    .filter((slot) => slot.roomId === room)
                                    .map((slot) => {
                                        const startMin = slot.startTime.getHours() * 60 + slot.startTime.getMinutes()
                                        const offsetTop = ((startMin - HOURS[0] * 60) / 60) * 96
                                        const durationMin = (slot.endTime.getTime() - slot.startTime.getTime()) / 60000
                                        const height = (durationMin / 60) * 96

                                        return (
                                            <div
                                                key={slot.id}
                                                style={{ top: `${offsetTop}px`, height: `${height}px` }}
                                                className={cn(
                                                    "absolute left-1 right-1 rounded-lg border p-2 shadow-sm",
                                                    slot.isBooked
                                                        ? "border-green-300 bg-green-50 text-green-900"
                                                        : slot.isPublic
                                                            ? "border-blue-300 bg-blue-50 text-blue-900"
                                                            : "border-amber-300 bg-amber-50 text-amber-900"
                                                )}
                                            >
                                                <div className="text-[10px] font-bold opacity-70">
                                                    {format(slot.startTime, "HH:mm")} - {format(slot.endTime, "HH:mm")}
                                                </div>
                                                <div className="mt-1">
                                                    {slot.isBooked ? (
                                                        <Badge variant="outline" className="border-green-200 bg-green-100 text-[10px] text-green-800">
                                                            予約済み
                                                        </Badge>
                                                    ) : slot.isPublic ? (
                                                        <Badge variant="outline" className="border-blue-200 bg-blue-100 text-[10px] text-blue-800">
                                                            公開中
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-amber-200 bg-amber-100 text-[10px] text-amber-800">
                                                            下書き
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
