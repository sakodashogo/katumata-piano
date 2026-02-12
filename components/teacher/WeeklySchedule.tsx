"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { bulkUpdateOpenSlots } from "@/app/lib/actions/schedule"
import { cn } from "@/lib/utils"
import { addDays, format, isSameDay, startOfWeek, addMinutes, setHours, setMinutes, isSameMinute } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    UserPlus,
    CalendarPlus,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { bookLesson } from "@/app/lib/actions/booking"

type OpenSlot = {
    id: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    roomId: string
    isPublic: boolean
}

type Lesson = {
    id: string
    startTime: Date
    endTime: Date
    status: string
    roomId: string
    type: string
    student: {
        id: string
        name: string | null
    }
}

type Student = {
    id: string
    name: string | null
    email: string
}

const LESSON_TYPE_COLORS: Record<string, string> = {
    REGULAR: "bg-blue-600 text-white border-blue-700",
    AD_HOC: "bg-orange-500 text-white border-orange-600",
    PRACTICE: "bg-slate-400 text-white border-slate-500",
    SOLO_ADDITIONAL: "bg-purple-600 text-white border-purple-700",
    DUET_ADDITIONAL: "bg-rose-500 text-white border-rose-600",
}

const LESSON_TYPE_LABELS: Record<string, string> = {
    REGULAR: "固定",
    AD_HOC: "振替",
    PRACTICE: "自主練",
    SOLO_ADDITIONAL: "ソロ追加",
    DUET_ADDITIONAL: "連弾追加",
}

export function WeeklySchedule({
    roomId,
    date,
    slots,
    lessons,
    students
}: {
    roomId: string
    date: Date
    slots: OpenSlot[]
    lessons: Lesson[]
    students: Student[]
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

    // Proxy Booking State
    const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
    const [selectedSlotForBooking, setSelectedSlotForBooking] = useState<{ day: Date, time: Date, slotId?: string } | null>(null)
    const [selectedStudentId, setSelectedStudentId] = useState<string>("")
    const [selectedLessonType, setSelectedLessonType] = useState<string>("REGULAR")

    // Paint State
    const [isPainting, setIsPainting] = useState(false)
    const [paintMode, setPaintMode] = useState<'add' | 'remove'>('add')
    const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set())

    const getCellDateTime = (day: Date, time: Date) => {
        return setMinutes(setHours(day, time.getHours()), time.getMinutes())
    }

    const handleMouseDown = (day: Date, time: Date, currentStatus: 'open' | 'closed' | 'booked') => {
        if (currentStatus === 'booked') return

        setIsPainting(true)
        const mode = currentStatus === 'open' ? 'remove' : 'add'
        setPaintMode(mode)

        const iso = getCellDateTime(day, time).toISOString()
        setPendingChanges(new Set([iso]))
    }

    const handleMouseEnter = (day: Date, time: Date, currentStatus: 'open' | 'closed' | 'booked') => {
        if (!isPainting || currentStatus === 'booked') return

        const iso = getCellDateTime(day, time).toISOString()
        const newPending = new Set(pendingChanges)
        newPending.add(iso)
        setPendingChanges(newPending)
    }

    const handleMouseUp = useCallback(async () => {
        if (!isPainting) return
        setIsPainting(false)

        if (pendingChanges.size === 0) return

        const slotsToUpdate = Array.from(pendingChanges)
        startTransition(async () => {
            const result = await bulkUpdateOpenSlots(roomId, slotsToUpdate, paintMode)
            if (result.success) {
                setPendingChanges(new Set())
                router.refresh()
            } else {
                toast.error("更新に失敗しました")
                setPendingChanges(new Set())
            }
        })
    }, [isPainting, paintMode, pendingChanges, roomId, router, startTransition, toast])

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isPainting) void handleMouseUp()
        }
        window.addEventListener('mouseup', handleGlobalMouseUp)
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }, [handleMouseUp, isPainting])

    const navigateWeek = (direction: 'prev' | 'next') => {
        const newDate = addDays(date, direction === 'next' ? 7 : -7)
        router.push(`?room=${roomId}&date=${newDate.toISOString().split('T')[0]}`)
    }

    const switchRoom = (newRoom: string) => {
        router.push(`?room=${newRoom}&date=${date.toISOString().split('T')[0]}`)
    }

    const handleCellClick = (day: Date, time: Date, slot?: OpenSlot, lesson?: Lesson) => {
        if (lesson) {
            // Show lesson details?
            return
        }
        if (slot) {
            setSelectedSlotForBooking({ day, time, slotId: slot.id })
            setBookingDialogOpen(true)
        }
    }

    const handleProxyBook = async () => {
        if (!selectedStudentId || !selectedSlotForBooking) return

        startTransition(async () => {
            // Re-using bookLesson or similar. 
            // Teachers might need a specific action that bypasses some student-only checks.
            const res = await bookLesson([selectedSlotForBooking.slotId!], "manual", false)
            // "manual" is a placeholder for menuId, might need a real menuId or update bookLesson
            if (res.success) {
                toast.success("予約を追加しました")
                setBookingDialogOpen(false)
                router.refresh()
            } else {
                const errorMessage = "error" in res ? res.error : undefined
                toast.error(errorMessage || "予約に失敗しました")
            }
        })
    }

    return (
        <div className="space-y-4 select-none">
            {/* Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => switchRoom("A")}
                        className={cn(
                            "px-6 py-2 text-sm font-bold rounded-lg transition-all",
                            roomId === "A" ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-900"
                        )}
                    >
                        ピアノ室 A
                    </button>
                    <button
                        onClick={() => switchRoom("B")}
                        className={cn(
                            "px-6 py-2 text-sm font-bold rounded-lg transition-all",
                            roomId === "B" ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-900"
                        )}
                    >
                        ピアノ室 B
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden lg:flex items-center text-[10px] gap-2 mr-4 bg-white p-2 rounded-lg border">
                        {Object.entries(LESSON_TYPE_LABELS).map(([type, label]) => (
                            <div key={type} className="flex items-center gap-1">
                                <div className={cn("w-2 h-2 rounded", LESSON_TYPE_COLORS[type])}></div>
                                {label}
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => navigateWeek('prev')}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="bg-white border rounded-lg px-4 py-1.5 flex flex-col items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {format(days[0], "yyyy")}
                            </span>
                            <span className="text-sm font-black text-slate-800">
                                {format(days[0], "M/d")} - {format(days[6], "M/d")}
                            </span>
                        </div>
                        <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => navigateWeek('next')}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Schedule Grid */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                <table className="w-full min-w-[800px] border-collapse">
                    <thead>
                        <tr className="bg-slate-50">
                            <th className="w-20 px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-r sticky left-0 bg-slate-50 z-10">
                                Time
                            </th>
                            {days.map((day) => (
                                <th key={day.toString()} className={cn(
                                    "px-4 py-4 border-b border-r last:border-r-0",
                                    isSameDay(day, new Date()) ? "bg-blue-50/50" : ""
                                )}>
                                    <div className="flex flex-col items-center">
                                        <span className={cn(
                                            "text-[10px] font-black uppercase tracking-tighter mb-1",
                                            isSameDay(day, new Date()) ? "text-blue-500" : "text-slate-400"
                                        )}>
                                            {format(day, "EEEE", { locale: ja })}
                                        </span>
                                        <span className={cn(
                                            "text-xl font-black",
                                            isSameDay(day, new Date()) ? "text-blue-600" : "text-slate-800"
                                        )}>
                                            {format(day, "d")}
                                        </span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {timeSlots.map((time) => (
                            <tr key={time.toString()} className="group hover:bg-slate-50/30 transition-colors">
                                <td className="w-20 border-r border-slate-100 px-4 py-3 text-[11px] font-black text-slate-400 sticky left-0 bg-white z-10 group-hover:bg-slate-50/30 transition-colors">
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

                                    let visualState = 'closed'
                                    if (isLesson) visualState = 'lesson'
                                    else if (isBooked) visualState = 'booked'
                                    else if (isOpen) visualState = 'open'

                                    if (isPendingChange && !isBooked && !isLesson) {
                                        visualState = paintMode === 'add' ? 'open' : 'closed'
                                    }

                                    return (
                                        <td
                                            key={day.toString()}
                                            className="border-r border-slate-100 p-1 last:border-0 h-16 group/cell relative"
                                            onMouseDown={(e) => {
                                                if (e.button === 0 && !isLesson && !isBooked) handleMouseDown(day, time, isOpen ? 'open' : 'closed')
                                            }}
                                            onMouseEnter={() => !isLesson && !isBooked && handleMouseEnter(day, time, isOpen ? 'open' : 'closed')}
                                            onClick={() => handleCellClick(day, time, slot, lesson)}
                                        >
                                            <div className={cn(
                                                "w-full h-full rounded-lg flex flex-col items-center justify-center transition-all duration-150 relative overflow-hidden",
                                                isLesson
                                                    ? cn("border-2 shadow-sm p-1", LESSON_TYPE_COLORS[lesson.type] || "bg-slate-500 text-white")
                                                    : isBooked
                                                        ? "bg-slate-100 border-2 border-slate-200 text-slate-400 cursor-not-allowed"
                                                        : visualState === 'open'
                                                            ? slot?.isPublic
                                                                ? "bg-blue-50 border-2 border-blue-500 text-blue-700 shadow-sm"
                                                                : "bg-white border-2 border-amber-300 border-dashed text-amber-600"
                                                            : "hover:bg-slate-100/50 cursor-pointer"
                                            )}>
                                                {isLesson ? (
                                                    <>
                                                        <span className="text-[10px] font-black opacity-70 mb-0.5 leading-none">
                                                            {LESSON_TYPE_LABELS[lesson.type] || "確定"}
                                                        </span>
                                                        <span className="text-[11px] font-black truncate w-full text-center px-1">
                                                            {lesson.student?.name || "名前なし"}
                                                        </span>
                                                    </>
                                                ) : isBooked ? (
                                                    <span className="text-[10px] font-black opacity-50 uppercase tracking-tighter">Booked</span>
                                                ) : visualState === 'open' ? (
                                                    <>
                                                        <span className="text-[10px] font-black tracking-widest leading-none mb-1">OPEN</span>
                                                        <div className="flex gap-1">
                                                            {!slot?.isPublic && <Badge variant="outline" className="text-[8px] h-3 px-1 border-amber-200 bg-amber-50 text-amber-600">DRAFT</Badge>}
                                                            <UserPlus className="h-3 w-3 opacity-50" />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                        <Plus className="h-4 w-4 text-slate-300" />
                                                    </div>
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

            {/* Proxy Booking Dialog */}
            <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
                <DialogContent className="sm:max-w-[425px] rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black">代理予約</DialogTitle>
                        <DialogDescription className="font-medium text-slate-500">
                            {selectedSlotForBooking && format(selectedSlotForBooking.day, "M月 d日 (E)", { locale: ja })}
                            {" "}{selectedSlotForBooking && format(selectedSlotForBooking.time, "HH:mm")} からの枠に生徒を割り当てます。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-700 ml-1">生徒を選択</label>
                            <Select onValueChange={setSelectedStudentId} value={selectedStudentId}>
                                <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:ring-blue-500">
                                    <SelectValue placeholder="生徒を選択してください" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {students.map(s => (
                                        <SelectItem key={s.id} value={s.id} className="rounded-lg">
                                            {s.name || s.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-black text-slate-700 ml-1">レッスンの種類</label>
                            <Select onValueChange={setSelectedLessonType} value={selectedLessonType}>
                                <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:ring-blue-500">
                                    <SelectValue placeholder="種類を選択" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {Object.entries(LESSON_TYPE_LABELS).map(([key, label]) => (
                                        <SelectItem key={key} value={key} className="rounded-lg">
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            className="w-full h-12 rounded-xl font-black text-lg bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200"
                            onClick={handleProxyBook}
                            disabled={!selectedStudentId || isPending}
                        >
                            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarPlus className="h-5 w-5 mr-2" />}
                            予約を確定する
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {isPending && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-2xl z-50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    スケジュールを更新中...
                </div>
            )}
        </div>
    )
}

function Plus({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M5 12h14" /><path d="M12 5v14" />
        </svg>
    )
}
