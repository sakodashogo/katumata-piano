"use client"

import { useState, useMemo } from "react"
import { format, addDays, startOfToday, setHours, setMinutes, isSameDay, addMinutes, startOfDay } from "date-fns"
import { ja } from "date-fns/locale"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Trash2,
    CheckCircle2,
    Eye,
    EyeOff,
    Clock,
    LayoutGrid,
    Calendar as CalendarIcon
} from "lucide-react"
import {
    createOpenSlot,
    deleteOpenSlot,
    updateOpenSlot,
    publishOpenSlots
} from "@/app/lib/actions/resource"
import { toast } from "sonner" // Assuming sonner or similar is available, otherwise console.log

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
const ROOMS = ["A", "B"]

type OpenSlot = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    isPublic: boolean
}

type Props = {
    initialSlots: any[]
    year: number
    month: number
}

export function ResourceManager({ initialSlots, year, month }: Props) {
    const [slots, setSlots] = useState<OpenSlot[]>(
        initialSlots.map(s => ({
            ...s,
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime)
        }))
    )
    const [selectedDate, setSelectedDate] = useState(startOfToday())
    const [isSubmitting, setIsSubmitting] = useState(false)

    const filteredSlots = useMemo(() => {
        return slots.filter(s => isSameDay(s.startTime, selectedDate))
    }, [slots, selectedDate])

    const handleAddSlot = async (roomId: string, hour: number, minutes: number, duration: number) => {
        const start = setMinutes(setHours(startOfDay(selectedDate), hour), minutes)
        const end = addMinutes(start, duration)

        // Check for overlap
        const overlap = filteredSlots.some(s =>
            s.roomId === roomId &&
            ((start >= s.startTime && start < s.endTime) ||
                (end > s.startTime && end <= s.endTime))
        )

        if (overlap) {
            alert("既存の枠と重なっています。")
            return
        }

        setIsSubmitting(true)
        const res = await createOpenSlot({ roomId, startTime: start, endTime: end })
        if (res.success && res.data) {
            const newSlot: OpenSlot = {
                ...res.data,
                startTime: new Date(res.data.startTime),
                endTime: new Date(res.data.endTime),
                isPublic: false
            }
            setSlots([...slots, newSlot])
        }
        setIsSubmitting(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("この枠を削除しますか？")) return
        setIsSubmitting(true)
        const res = await deleteOpenSlot(id)
        if (res.success) {
            setSlots(slots.filter(s => s.id !== id))
        }
        setIsSubmitting(false)
    }

    const handleTogglePublic = async (slot: OpenSlot) => {
        setIsSubmitting(true)
        const res = await updateOpenSlot(slot.id, { isPublic: !slot.isPublic })
        if (res.success) {
            setSlots(slots.map(s => s.id === slot.id ? { ...s, isPublic: !slot.isPublic } : s))
        }
        setIsSubmitting(false)
    }

    const handlePublishAllOnDay = async () => {
        const unpublishedIds = filteredSlots.filter(s => !s.isPublic).map(s => s.id)
        if (unpublishedIds.length === 0) return

        setIsSubmitting(true)
        const res = await publishOpenSlots(unpublishedIds)
        if (res.success) {
            setSlots(slots.map(s => unpublishedIds.includes(s.id) ? { ...s, isPublic: true } : s))
        }
        setIsSubmitting(false)
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
            {/* Sidebar / Date Selector */}
            <div className="space-y-6">
                <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold flex items-center gap-2">
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
                    <div className="text-center py-2 bg-slate-50 rounded-lg mb-4">
                        <span className="text-2xl font-black text-slate-800">
                            {format(selectedDate, "M月 d日", { locale: ja })}
                        </span>
                        <span className="ml-2 text-slate-500">({format(selectedDate, "EEEE", { locale: ja })})</span>
                    </div>

                    <div className="space-y-2">
                        <Button
                            className="w-full justify-start gap-2 h-11"
                            variant="outline"
                            onClick={handlePublishAllOnDay}
                            disabled={isSubmitting || filteredSlots.filter(s => !s.isPublic).length === 0}
                        >
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            現在の日の枠をすべて公開
                        </Button>
                    </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        クイック追加
                    </h3>
                    <p className="text-xs text-blue-600 mb-4">
                        空いている時間をクリックするか、以下のボタンで基本的な枠を追加できます。
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {[30, 45, 60].map(dur => (
                            <Button key={dur} variant="secondary" size="sm" className="bg-white hover:bg-white/80 text-[11px] h-8">
                                {dur}分
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Resource Grid */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[700px]">
                <div className="grid grid-cols-[80px_1fr_1fr] bg-slate-100 border-b">
                    <div className="p-4 border-r"></div>
                    {ROOMS.map(room => (
                        <div key={room} className="p-4 text-center font-bold text-slate-700 flex items-center justify-center gap-2 border-r last:border-r-0">
                            <LayoutGrid className="h-4 w-4 text-slate-400" />
                            ピアノ室 {room}
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto relative">
                    <div className="grid grid-cols-[80px_1fr_1fr] min-h-full">
                        {/* Time labels */}
                        <div className="bg-slate-50 border-r">
                            {HOURS.map(h => (
                                <div key={h} className="h-24 border-b text-[10px] text-slate-400 p-2 font-mono flex flex-col justify-between italic">
                                    <span>{h}:00</span>
                                    <span className="opacity-50">{h}:30</span>
                                </div>
                            ))}
                        </div>

                        {/* Room Columns */}
                        {ROOMS.map(room => (
                            <div key={room} className="relative border-r last:border-r-0 bg-slate-50/30">
                                {/* Grid lines background */}
                                {HOURS.map(h => (
                                    <div key={h} className="h-24 border-b relative group">
                                        {/* Click to add areas (00 and 30) */}
                                        <div
                                            className="absolute top-0 w-full h-1/2 hover:bg-blue-500/10 cursor-alias transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                                            onClick={() => handleAddSlot(room, h, 0, 30)}
                                        >
                                            <Plus className="h-4 w-4 text-blue-400" />
                                        </div>
                                        <div
                                            className="absolute bottom-0 w-full h-1/2 hover:bg-blue-500/10 border-t border-dashed border-slate-100 cursor-alias transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                                            onClick={() => handleAddSlot(room, h, 30, 30)}
                                        >
                                            <Plus className="h-4 w-4 text-blue-400" />
                                        </div>
                                    </div>
                                ))}

                                {/* Slots */}
                                <AnimatePresence>
                                    {filteredSlots.filter(s => s.roomId === room).map(slot => {
                                        const startMin = slot.startTime.getHours() * 60 + slot.startTime.getMinutes()
                                        const gridStartMin = HOURS[0] * 60
                                        const offsetTop = ((startMin - gridStartMin) / 60) * 96 // 96px per hour
                                        const durationMin = (slot.endTime.getTime() - slot.startTime.getTime()) / 60000
                                        const height = (durationMin / 60) * 96

                                        return (
                                            <motion.div
                                                key={slot.id}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                style={{ top: `${offsetTop}px`, height: `${height}px` }}
                                                className={cn(
                                                    "absolute left-1 right-1 rounded-lg border-2 p-2 shadow-sm flex flex-col justify-between transition-all",
                                                    slot.isBooked
                                                        ? "bg-slate-100 border-slate-200 text-slate-400"
                                                        : slot.isPublic
                                                            ? "bg-white border-blue-500 text-blue-900 shadow-blue-100/50"
                                                            : "bg-white border-amber-300 border-dashed text-amber-900 shadow-amber-100/50"
                                                )}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold opacity-60">
                                                            {format(slot.startTime, "HH:mm")} - {format(slot.endTime, "HH:mm")}
                                                        </span>
                                                        <span className="text-xs font-bold truncate">
                                                            {slot.isBooked ? "【予約済み】" : slot.isPublic ? "公開中" : "下書き"}
                                                        </span>
                                                    </div>
                                                    {!slot.isBooked && (
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => handleTogglePublic(slot)}
                                                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-500 transition-colors"
                                                            >
                                                                {slot.isPublic ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(slot.id)}
                                                                className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-colors"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {!slot.isBooked && !slot.isPublic && (
                                                    <div className="mt-auto">
                                                        <Badge variant="outline" className="text-[9px] h-4 px-1 bg-amber-50 text-amber-700 border-amber-200">
                                                            承認待ち
                                                        </Badge>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
