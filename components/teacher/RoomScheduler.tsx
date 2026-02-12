"use client"

import { useState, useMemo } from "react"
import { format, startOfWeek, endOfWeek, addDays, eachDayOfInterval, isSameDay, addMinutes, setHours, setMinutes, isBefore } from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronLeft, ChevronRight, Save, Upload, Trash2, Plus } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { ROOMS } from "@/lib/constants"
import { createOpenSlot, deleteOpenSlot, publishOpenSlots } from "@/app/lib/actions/resource"
import { useRouter } from "next/navigation"

type OpenSlot = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    isPublic: boolean
}

type Lesson = {
    id: string
    roomId: string | null
    startTime: Date
    endTime: Date
    student: { name: string | null }
}

type Props = {
    initialDate?: Date
    slots: OpenSlot[]
    lessons: Lesson[]
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9) // 09:00 - 21:00
const MINUTES = [0, 30]

export function RoomScheduler({ initialDate = new Date(), slots, lessons }: Props) {
    const router = useRouter()
    const { toast } = useToast()
    const [currentDate, setCurrentDate] = useState(initialDate)
    const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Calendar Calculations
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }) // Monday start
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

    // Helper to get items for a cell
    const getCellData = (day: Date, hour: number, minute: number, roomId: string) => {
        const time = setMinutes(setHours(day, hour), minute)
        const slot = slots.find(s =>
            s.roomId === roomId &&
            new Date(s.startTime).getTime() === time.getTime()
        )
        const lesson = lessons.find(l =>
            l.roomId === roomId &&
            new Date(l.startTime).getTime() === time.getTime()
        )
        return { time, slot, lesson }
    }

    // Actions
    const handleSlotClick = async (roomId: string, time: Date, existingSlot?: OpenSlot) => {
        if (isSubmitting) return

        if (existingSlot) {
            // If booked, do nothing (or show info)
            if (existingSlot.isBooked) {
                toast.error("予約済みの枠は変更できません。")
                return
            }

            // Toggle selection for bulk actions? Or just delete?
            // Let's make single click = toggle selection, Double click (or specific button) = delete?
            // User requirement: "Teacher edits... then Publish".
            // Let's support: Click to Select. if Selected, show Action menu (Delete, Publish).

            if (selectedSlots.has(existingSlot.id)) {
                const newSet = new Set(selectedSlots)
                newSet.delete(existingSlot.id)
                setSelectedSlots(newSet)
            } else {
                setSelectedSlots(new Set(selectedSlots).add(existingSlot.id))
            }
        } else {
            // Create New Slot (Draft)
            setIsSubmitting(true)
            const endTime = addMinutes(time, 30)
            const result = await createOpenSlot({ roomId, startTime: time, endTime })
            setIsSubmitting(false)

            if (!result.success) {
                toast.error("枠の作成に失敗しました。")
            } else {
                toast.success("下書き枠を作成しました。")
                router.refresh()
            }
        }
    }

    const handlePublishSelected = async () => {
        if (selectedSlots.size === 0) return
        setIsSubmitting(true)
        const result = await publishOpenSlots(Array.from(selectedSlots))
        setIsSubmitting(false)

        if (result.success) {
            toast.success(`${selectedSlots.size}件の枠を公開しました。`)
            setSelectedSlots(new Set())
            router.refresh()
        } else {
            toast.error("公開に失敗しました。")
        }
    }

    const handleDeleteSelected = async () => {
        if (selectedSlots.size === 0) return
        if (!confirm("選択した枠を削除しますか？")) return

        setIsSubmitting(true)
        // Parallel delete? resource.ts doesn't have bulk delete yet.
        // We can add it or loop. Loop is fine for now or I'll add bulk delete later.
        // Let's loop for MVP.
        let successCount = 0
        for (const id of Array.from(selectedSlots)) {
            const res = await deleteOpenSlot(id)
            if (res.success) successCount++
        }
        setIsSubmitting(false)

        toast.success(`${successCount}件の枠を削除しました。`)
        setSelectedSlots(new Set())
        router.refresh()
    }

    // Select All Drafts
    const handleSelectAllDrafts = () => {
        const draftIds = slots.filter(s => !s.isPublic && !s.isBooked).map(s => s.id)
        setSelectedSlots(new Set(draftIds))
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-md border bg-slate-50">
                        <Button variant="ghost" className="w-8 h-8 p-0" onClick={() => setCurrentDate(d => addDays(d, -7))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-4 font-bold text-lg min-w-[140px] text-center">
                            {format(weekStart, "M月d日", { locale: ja })} - {format(weekEnd, "d日", { locale: ja })}
                        </span>
                        <Button variant="ghost" className="w-8 h-8 p-0" onClick={() => setCurrentDate(d => addDays(d, 7))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="text-sm text-slate-500">
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-100 border border-dashed border-slate-300"></div>空き(なし)</div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-50 border border-amber-200"></div>下書き</div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-50 border border-blue-200"></div>公開中</div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-100 border border-green-300"></div>予約済み</div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelectAllDrafts}>
                        全下書き選択
                    </Button>
                    {selectedSlots.size > 0 && (
                        <>
                            <Button
                                variant="primary"
                                className="bg-red-600 hover:bg-red-700 text-white"
                                size="sm"
                                onClick={handleDeleteSelected}
                                disabled={isSubmitting}
                            >
                                <Trash2 className="h-4 w-4 mr-2" /> 削除 ({selectedSlots.size})
                            </Button>
                            <Button
                                variant="primary"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                size="sm"
                                onClick={handlePublishSelected}
                                disabled={isSubmitting}
                            >
                                <Upload className="h-4 w-4 mr-2" /> 公開 ({selectedSlots.size})
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <ScrollArea className="h-[calc(100vh-200px)] border rounded-md bg-white">
                <div className="min-w-[1000px] p-4">
                    {/* Header */}
                    <div className="grid grid-cols-[80px_repeat(7,_1fr)] gap-0 border-b sticky top-0 bg-white z-10 shadow-sm">
                        <div className="p-2 text-center text-xs font-bold text-slate-500 bg-slate-50">時間</div>
                        {days.map(day => (
                            <div key={day.toISOString()} className={cn(
                                "p-2 text-center border-l",
                                isSameDay(day, new Date()) ? "bg-blue-50/50" : "bg-slate-50"
                            )}>
                                <div className="font-bold text-slate-700">{format(day, "M/d", { locale: ja })}</div>
                                <div className="text-xs text-slate-500">({format(day, "E", { locale: ja })})</div>
                            </div>
                        ))}
                    </div>

                    {/* Body */}
                    <div className="divide-y">
                        {HOURS.map(hour => (
                            MINUTES.map(minute => (
                                <div key={`${hour}-${minute}`} className="grid grid-cols-[80px_repeat(7,_1fr)] min-h-[60px] hover:bg-slate-50/50 transition-colors">
                                    {/* Time Column */}
                                    <div className="p-2 text-xs text-slate-400 text-right flex items-start justify-end pr-3 border-r">
                                        {minute === 0 && <span className="font-mono">{hour}:00</span>}
                                        {minute === 30 && <span className="font-mono opacity-50">{hour}:30</span>}
                                    </div>

                                    {/* Days Columns */}
                                    {days.map(day => (
                                        <div key={day.toISOString()} className="border-r p-1 grid grid-cols-2 gap-1 relative group">
                                            {/* Room A */}
                                            <RoomCell
                                                roomId={ROOMS.A.id}
                                                data={getCellData(day, hour, minute, ROOMS.A.id)}
                                                onClick={handleSlotClick}
                                                isSelected={(id) => selectedSlots.has(id)}
                                                label="A"
                                            />
                                            {/* Room B */}
                                            <RoomCell
                                                roomId={ROOMS.B.id}
                                                data={getCellData(day, hour, minute, ROOMS.B.id)}
                                                onClick={handleSlotClick}
                                                isSelected={(id) => selectedSlots.has(id)}
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
        </div>
    )
}

function RoomCell({ roomId, data, onClick, isSelected, label }: {
    roomId: string,
    data: { time: Date, slot?: OpenSlot, lesson?: Lesson },
    onClick: (roomId: string, time: Date, slot?: OpenSlot) => void,
    isSelected: (id: string) => boolean,
    label: string
}) {
    const { time, slot, lesson } = data

    // Styles
    let bgClass = "bg-white hover:bg-slate-50 cursor-pointer border border-dashed border-slate-200"
    let content = <span className="text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity center">{label}</span>

    if (lesson) {
        bgClass = "bg-green-100 border-green-200 cursor-default"
        content = (
            <div className="text-[10px] font-medium text-green-800 truncate px-1" title={lesson.student.name || ""}>
                {lesson.student.name}
            </div>
        )
    } else if (slot) {
        if (slot.isBooked) {
            bgClass = "bg-green-100 border-green-200 cursor-default"
            content = <span className="text-[10px] text-green-800">予約済</span>
        } else if (slot.isPublic) {
            bgClass = isSelected(slot.id)
                ? "bg-blue-100 ring-2 ring-blue-500 border-blue-300 cursor-pointer"
                : "bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100"
            content = <span className="text-[10px] text-blue-700 font-medium">公開中</span>
        } else {
            // Draft
            bgClass = isSelected(slot.id)
                ? "bg-amber-100 ring-2 ring-amber-500 border-amber-300 cursor-pointer"
                : "bg-amber-50 border-amber-200 cursor-pointer hover:bg-amber-100"
            content = <span className="text-[10px] text-amber-700 font-medium">下書き</span>
        }
    }

    return (
        <div
            className={cn("h-full rounded flex items-center justify-center transition-all", bgClass)}
            onClick={() => !lesson && onClick(roomId, time, slot)}
        >
            {content}
        </div>
    )
}
