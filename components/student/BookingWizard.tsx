"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { bookLesson, getBookableSlotsInRange, rescheduleLesson } from "@/app/lib/actions/booking"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { ROOMS } from "@/lib/constants"
import {
    addDays,
    endOfMonth,
    format,
    isSameDay,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from "date-fns"
import { ja } from "date-fns/locale"
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Loader2, Ticket } from "lucide-react"

type Menu = {
    id: string
    name: string
    durationMin: number
    price: number
    description: string | null
}

type RawSlot = {
    slotIds: string[]
    startTime: string | Date
    endTime: string | Date
    roomId: string
}

type Slot = {
    slotIds: string[]
    startTime: Date
    endTime: Date
    roomId: string
}

type ReschedulePolicy = {
    lessonId: string
    lessonStart: string
    menuId: string | null
    deadline: string
    windowStart: string
    windowEnd: string
    monthStart: string
    monthEnd: string
    monthlyUsed: number
    monthlyRemaining: number
    canReschedule: boolean
    reason: string | null
}

function roomLabel(roomId: string) {
    if (roomId === ROOMS.A.id) return "第1レッスン室（メイン）"
    if (roomId === ROOMS.B.id) return "第2レッスン室（サポート/自主練）"
    return `Room ${roomId}`
}

function intersectDateRange(start: Date, end: Date, min: Date, max: Date) {
    const effectiveStart = start > min ? start : min
    const effectiveEnd = end < max ? end : max
    return effectiveStart <= effectiveEnd ? { start: effectiveStart, end: effectiveEnd } : null
}

export function BookingWizard({
    menus,
    rescheduleLessonId,
    initialMenuId,
    credits,
    reschedulePolicy,
}: {
    menus: Menu[]
    rescheduleLessonId?: string
    initialMenuId?: string
    credits?: { count: number; used: number; remaining: number } | null
    reschedulePolicy?: ReschedulePolicy | null
}) {
    const router = useRouter()
    const { toast } = useToast()

    const [step, setStep] = useState(initialMenuId ? 2 : 1)
    const [selectedMenu, setSelectedMenu] = useState<Menu | null>(
        initialMenuId ? menus.find((m) => m.id === initialMenuId) || null : null
    )
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
    const [monthlySlots, setMonthlySlots] = useState<Slot[]>([])
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
    const [loadingMonth, setLoadingMonth] = useState(false)
    const [loadingBooking, setLoadingBooking] = useState(false)
    const [bookingSuccess, setBookingSuccess] = useState(false)
    const [useTicket, setUseTicket] = useState(false)

    const rescheduleWindowStart = useMemo(
        () => (reschedulePolicy ? new Date(reschedulePolicy.windowStart) : null),
        [reschedulePolicy]
    )
    const rescheduleWindowEnd = useMemo(
        () => (reschedulePolicy ? new Date(reschedulePolicy.windowEnd) : null),
        [reschedulePolicy]
    )
    const isRescheduleBlocked = !!rescheduleLessonId && (!reschedulePolicy || !reschedulePolicy.canReschedule)

    const normalizedMonthlySlots = useMemo(
        () =>
            monthlySlots
                .map((slot) => ({
                    ...slot,
                    startTime: slot.startTime instanceof Date ? slot.startTime : parseISO(String(slot.startTime)),
                    endTime: slot.endTime instanceof Date ? slot.endTime : parseISO(String(slot.endTime)),
                }))
                .sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
        [monthlySlots]
    )

    const slotsByDateKey = useMemo(() => {
        const map = new Map<string, Slot[]>()
        for (const slot of normalizedMonthlySlots) {
            const key = format(slot.startTime, "yyyy-MM-dd")
            const list = map.get(key) || []
            list.push(slot)
            map.set(key, list)
        }
        return map
    }, [normalizedMonthlySlots])

    const availableDateKeys = useMemo(() => new Set(slotsByDateKey.keys()), [slotsByDateKey])

    const selectedDateSlots = useMemo(() => {
        const key = format(selectedDate, "yyyy-MM-dd")
        return (slotsByDateKey.get(key) || []).sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    }, [selectedDate, slotsByDateKey])

    const weekDays = useMemo(() => {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
        return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    }, [selectedDate])

    const fetchMonthSlots = useCallback(async () => {
        if (!selectedMenu) return

        const monthStart = startOfMonth(currentMonth)
        const monthEndExclusive = addDays(endOfMonth(currentMonth), 1)
        const effectiveRange = rescheduleWindowStart && rescheduleWindowEnd
            ? intersectDateRange(monthStart, monthEndExclusive, rescheduleWindowStart, rescheduleWindowEnd)
            : { start: monthStart, end: monthEndExclusive }

        if (!effectiveRange) {
            setMonthlySlots([])
            return
        }

        setLoadingMonth(true)
        const res = await getBookableSlotsInRange(
            effectiveRange.start.toISOString(),
            effectiveRange.end.toISOString(),
            selectedMenu.id
        )
        if (res.success && res.data) {
            const next = (res.data as RawSlot[]).map((slot) => ({
                slotIds: slot.slotIds,
                roomId: slot.roomId,
                startTime: new Date(slot.startTime),
                endTime: new Date(slot.endTime),
            }))
            setMonthlySlots(next)
        } else {
            setMonthlySlots([])
        }
        setLoadingMonth(false)
    }, [currentMonth, selectedMenu, rescheduleWindowEnd, rescheduleWindowStart])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchMonthSlots()
    }, [fetchMonthSlots])

    useEffect(() => {
        if (!selectedMenu) return
        const selectedKey = format(selectedDate, "yyyy-MM-dd")
        if (availableDateKeys.has(selectedKey)) return
        const firstDateKey = Array.from(availableDateKeys.values()).sort()[0]
        if (!firstDateKey) return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedDate(new Date(`${firstDateKey}T00:00:00`))
    }, [availableDateKeys, selectedDate, selectedMenu])

    useEffect(() => {
        if (!selectedSlot) return
        const stillExists = selectedDateSlots.some(
            (slot) =>
                slot.roomId === selectedSlot.roomId &&
                slot.startTime.getTime() === selectedSlot.startTime.getTime()
        )
        if (!stillExists) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedSlot(null)
        }
    }, [selectedDateSlots, selectedSlot])

    const handleSelectMenu = (menu: Menu) => {
        setSelectedMenu(menu)
        setSelectedSlot(null)
        if (step === 1) setStep(2)
    }

    const handleBooking = async () => {
        if (!selectedSlot || !selectedMenu) return
        if (isRescheduleBlocked) {
            toast.error(reschedulePolicy?.reason || "このレッスンは振替できません。")
            return
        }

        setLoadingBooking(true)
        const res = (rescheduleLessonId
            ? await rescheduleLesson(rescheduleLessonId, selectedSlot.slotIds)
            : await bookLesson(selectedSlot.slotIds, selectedMenu.id, useTicket)) as {
                success: boolean
                error?: string
            }

        if (res.success) {
            setBookingSuccess(true)
        } else {
            toast.error(res.error || "予約に失敗しました。")
        }
        setLoadingBooking(false)
    }

    const isDateOutOfRescheduleWindow = (date: Date) => {
        if (!rescheduleWindowStart || !rescheduleWindowEnd) return false
        const dateStart = startOfDay(date)
        const min = startOfDay(rescheduleWindowStart)
        const max = startOfDay(rescheduleWindowEnd)
        return dateStart < min || dateStart > max
    }

    if (bookingSuccess && selectedMenu && selectedSlot) {
        return (
            <Card className="max-w-xl mx-auto">
                <CardContent className="py-10 space-y-6 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                    <h2 className="text-2xl font-bold">{rescheduleLessonId ? "変更完了" : "予約完了"}</h2>
                    <div className="text-sm text-slate-600 space-y-1">
                        <p>{selectedMenu.name}</p>
                        <p>{format(selectedSlot.startTime, "yyyy/MM/dd (E) HH:mm", { locale: ja })} - {format(selectedSlot.endTime, "HH:mm")}</p>
                        <p>{roomLabel(selectedSlot.roomId)}</p>
                    </div>
                    <Button onClick={() => router.push("/student")} className="w-full">
                        ダッシュボードに戻る
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {step > 1 && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setStep((prev) => prev - 1)}
                            disabled={!!initialMenuId && step === 2}
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    )}
                    <div>
                        <h2 className="text-xl font-bold">{rescheduleLessonId ? "予約日時の変更" : "レッスン予約"}</h2>
                        <p className="text-xs text-slate-500">STEP {step} / 3</p>
                    </div>
                </div>
                {credits && credits.remaining > 0 && !rescheduleLessonId && (
                    <div className="inline-flex items-center gap-1 rounded-md border bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        <Ticket className="h-3.5 w-3.5" />
                        振替チケット残 {credits.remaining}
                    </div>
                )}
            </div>

            {rescheduleLessonId && reschedulePolicy && (
                <div
                    className={cn(
                        "rounded-lg border px-3 py-2 text-sm",
                        reschedulePolicy.canReschedule
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-red-200 bg-red-50 text-red-700"
                    )}
                >
                    <div>
                        対象: {format(new Date(reschedulePolicy.lessonStart), "yyyy/MM/dd (E) HH:mm", { locale: ja })}
                    </div>
                    <div>
                        振替可能期間: {format(new Date(reschedulePolicy.windowStart), "yyyy/MM/dd")} - {format(new Date(reschedulePolicy.windowEnd), "yyyy/MM/dd")}
                    </div>
                    <div>今月残り: {reschedulePolicy.monthlyRemaining}回</div>
                    {!reschedulePolicy.canReschedule && <div className="font-semibold">{reschedulePolicy.reason}</div>}
                </div>
            )}

            {step === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">STEP1 メニュー選択</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {menus.map((menu) => {
                                const isActive = selectedMenu?.id === menu.id
                                return (
                                    <button
                                        key={menu.id}
                                        onClick={() => handleSelectMenu(menu)}
                                        className={cn(
                                            "rounded-lg border px-3 py-2 text-left transition-colors",
                                            isActive ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-900">{menu.name}</p>
                                                <p className="text-xs text-slate-500">{menu.durationMin}分</p>
                                            </div>
                                            <p className="text-xs font-semibold text-slate-700">¥{menu.price.toLocaleString()}</p>
                                        </div>
                                        {menu.description && (
                                            <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{menu.description}</p>
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={() => setStep(2)} disabled={!selectedMenu}>
                                次へ
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {step === 2 && selectedMenu && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">STEP2 日時選択</CardTitle>
                            <p className="text-xs text-slate-500">
                                第2レッスン室はサポート講師がいる時間は同時レッスン、空いている時間は自主練枠として公開されます。
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                                <div className="rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                                        <div className="inline-flex items-center gap-1">
                                            <CalendarDays className="h-4 w-4" />
                                            月カレンダー
                                        </div>
                                        {loadingMonth && <Loader2 className="h-4 w-4 animate-spin" />}
                                    </div>
                                    <Calendar
                                        mode="single"
                                        month={currentMonth}
                                        onMonthChange={setCurrentMonth}
                                        selected={selectedDate}
                                        onSelect={(date) => date && setSelectedDate(date)}
                                        disabled={(date) => isDateOutOfRescheduleWindow(date)}
                                        modifiers={{
                                            hasSlots: (date) => availableDateKeys.has(format(date, "yyyy-MM-dd")),
                                        }}
                                        modifiersClassNames={{
                                            hasSlots: "bg-blue-50 text-blue-700 font-semibold",
                                        }}
                                        className="rounded-md border"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="rounded-lg border p-3">
                                        <div className="mb-2 inline-flex items-center gap-1 text-xs text-slate-600">
                                            <CalendarDays className="h-4 w-4" />
                                            週ビュー
                                        </div>
                                        <div className="grid grid-cols-7 gap-2">
                                            {weekDays.map((day) => {
                                                const key = format(day, "yyyy-MM-dd")
                                                const count = (slotsByDateKey.get(key) || []).length
                                                const isActive = isSameDay(day, selectedDate)
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => setSelectedDate(day)}
                                                        className={cn(
                                                            "rounded-md border px-1 py-2 text-center",
                                                            isActive ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"
                                                        )}
                                                    >
                                                        <p className="text-[11px] text-slate-500">{format(day, "E", { locale: ja })}</p>
                                                        <p className="text-sm font-semibold">{format(day, "d")}</p>
                                                        <p className="text-[10px] text-slate-500">{count}枠</p>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    <div className="rounded-lg border p-3">
                                        <div className="mb-2 inline-flex items-center gap-1 text-xs text-slate-600">
                                            <Clock className="h-4 w-4" />
                                            月間空き枠一覧
                                        </div>
                                        <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                                            {Array.from(slotsByDateKey.entries())
                                                .sort(([a], [b]) => a.localeCompare(b))
                                                .map(([dateKey, slots]) => {
                                                    const day = new Date(`${dateKey}T00:00:00`)
                                                    const isActive = format(selectedDate, "yyyy-MM-dd") === dateKey
                                                    return (
                                                        <button
                                                            key={dateKey}
                                                            onClick={() => setSelectedDate(day)}
                                                            className={cn(
                                                                "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs",
                                                                isActive ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"
                                                            )}
                                                        >
                                                            <span>{format(day, "M/d (E)", { locale: ja })}</span>
                                                            <span className="font-semibold">{slots.length}枠</span>
                                                        </button>
                                                    )
                                                })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border p-3">
                                <p className="mb-2 text-sm font-semibold text-slate-800">
                                    {format(selectedDate, "yyyy年M月d日 (E)", { locale: ja })} の予約可能枠
                                </p>
                                {selectedDateSlots.length === 0 ? (
                                    <p className="text-sm text-slate-500">この日の空き枠はありません。</p>
                                ) : (
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {selectedDateSlots.map((slot) => {
                                            const isActive =
                                                !!selectedSlot &&
                                                slot.roomId === selectedSlot.roomId &&
                                                slot.startTime.getTime() === selectedSlot.startTime.getTime()
                                            return (
                                                <button
                                                    key={`${slot.roomId}-${slot.startTime.toISOString()}`}
                                                    onClick={() => setSelectedSlot(slot)}
                                                    className={cn(
                                                        "rounded-md border px-3 py-2 text-left",
                                                        isActive ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"
                                                    )}
                                                >
                                                    <p className="text-sm font-semibold text-slate-900">
                                                        {format(slot.startTime, "HH:mm")} - {format(slot.endTime, "HH:mm")}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">{roomLabel(slot.roomId)}</p>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setStep(1)}>
                                    戻る
                                </Button>
                                <Button disabled={!selectedSlot || isRescheduleBlocked} onClick={() => setStep(3)}>
                                    予約内容を確認
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {step === 3 && selectedMenu && selectedSlot && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">STEP3 最終確認</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1 text-sm">
                            <p><span className="font-semibold">メニュー:</span> {selectedMenu.name}</p>
                            <p><span className="font-semibold">日時:</span> {format(selectedSlot.startTime, "yyyy/MM/dd (E) HH:mm", { locale: ja })} - {format(selectedSlot.endTime, "HH:mm")}</p>
                            <p><span className="font-semibold">教室:</span> {roomLabel(selectedSlot.roomId)}</p>
                        </div>

                        {!rescheduleLessonId && credits && credits.remaining > 0 && (
                            <div className="flex items-center justify-between rounded-md border bg-amber-50 px-3 py-2">
                                <div>
                                    <Label htmlFor="ticket" className="font-semibold text-amber-800">振替チケットを使う</Label>
                                    <p className="text-xs text-amber-700">残り {credits.remaining} 枚</p>
                                </div>
                                <Switch
                                    id="ticket"
                                    checked={useTicket}
                                    onCheckedChange={setUseTicket}
                                    className="data-[state=checked]:bg-amber-500"
                                />
                            </div>
                        )}

                        <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span>料金</span>
                                <span className="font-semibold">¥{selectedMenu.price.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>チケット割引</span>
                                <span className="font-semibold">-{useTicket ? `¥${selectedMenu.price.toLocaleString()}` : "¥0"}</span>
                            </div>
                            <div className="mt-1 border-t pt-1 flex items-center justify-between">
                                <span className="font-semibold">合計</span>
                                <span className="text-lg font-bold">{useTicket ? "¥0" : `¥${selectedMenu.price.toLocaleString()}`}</span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setStep(2)}>
                                戻る
                            </Button>
                            <Button onClick={handleBooking} disabled={loadingBooking || isRescheduleBlocked}>
                                {loadingBooking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                予約する
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
