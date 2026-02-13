"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { addDays, format, isSameDay } from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ROOMS } from "@/lib/constants"
import {
    ArrowRight,
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
} from "lucide-react"
import { isSlotClosed, type ClosedDayRecord } from "@/lib/closed-days"
import { isWithinTeacherWorkingHours, type TeacherWorkingHoursByDay } from "@/lib/teacher-working-hours"

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
    status: string
    type?: string
    student?: { name: string | null } | null
}

type SupportShift = {
    id: string
    startTime: Date | string
    endTime: Date | string
    staff?: { id: string; name: string; active: boolean } | null
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
    initialLessons: Array<{
        id: string
        roomId: string | null
        startTime: Date | string
        endTime: Date | string
        status: string
        type?: string
        student?: { name: string | null } | null
    }>
    supportShifts: SupportShift[]
    closedDays?: ClosedDayRecord[]
    year: number
    month: number
    workingHours: TeacherWorkingHoursByDay
}

export function ResourceManager({
    initialSlots,
    initialLessons,
    supportShifts,
    closedDays = [],
    year,
    month,
    workingHours,
}: Props) {
    const slots = useMemo<OpenSlot[]>(
        () =>
            initialSlots.map((slot) => ({
                ...slot,
                startTime: new Date(slot.startTime),
                endTime: new Date(slot.endTime),
            })),
        [initialSlots]
    )

    const lessons = useMemo<Lesson[]>(
        () =>
            initialLessons.map((lesson) => ({
                ...lesson,
                startTime: new Date(lesson.startTime),
                endTime: new Date(lesson.endTime),
            })),
        [initialLessons]
    )

    const shifts = useMemo(
        () => supportShifts.map((shift) => ({
            ...shift,
            startTime: new Date(shift.startTime),
            endTime: new Date(shift.endTime),
        })),
        [supportShifts]
    )

    const firstDateWithData = useMemo(() => {
        const allStarts = [
            ...slots.map((slot) => slot.startTime),
            ...lessons.map((lesson) => lesson.startTime),
        ].sort((a, b) => a.getTime() - b.getTime())
        return allStarts[0] ?? new Date(year, month - 1, 1)
    }, [lessons, month, slots, year])

    const [selectedDate, setSelectedDate] = useState<Date>(firstDateWithData)

    const filteredSlots = useMemo(
        () => slots.filter((slot) => isSameDay(slot.startTime, selectedDate)),
        [selectedDate, slots]
    )
    const filteredLessons = useMemo(
        () => lessons.filter((lesson) => isSameDay(lesson.startTime, selectedDate)),
        [lessons, selectedDate]
    )

    const hourRange = useMemo(() => {
        const starts = [...filteredSlots, ...filteredLessons].map((item) => item.startTime.getHours())
        const ends = [...filteredSlots, ...filteredLessons].map((item) =>
            item.endTime.getHours() + (item.endTime.getMinutes() > 0 ? 1 : 0)
        )
        const minHour = starts.length > 0 ? Math.min(9, ...starts) : 9
        const maxHour = ends.length > 0 ? Math.max(21, ...ends) : 21
        return { minHour, maxHour }
    }, [filteredLessons, filteredSlots])

    const HOURS = useMemo(
        () => Array.from({ length: hourRange.maxHour - hourRange.minHour + 1 }, (_, idx) => hourRange.minHour + idx),
        [hourRange.maxHour, hourRange.minHour]
    )

    const draftCount = filteredSlots.filter((slot) => !slot.isBooked && !slot.isPublic).length
    const publicCount = filteredSlots.filter((slot) => !slot.isBooked && slot.isPublic).length
    const bookedSlotCount = filteredSlots.filter((slot) => slot.isBooked).length
    const lessonCount = filteredLessons.length

    const roomIds = [ROOMS.A.id, ROOMS.B.id] as const
    const hasWorkingSlotAt = (day: Date, hour: number) => {
        const firstStart = new Date(day)
        firstStart.setHours(hour, 0, 0, 0)
        const firstEnd = new Date(firstStart.getTime() + 30 * 60 * 1000)
        const secondStart = new Date(day)
        secondStart.setHours(hour, 30, 0, 0)
        const secondEnd = new Date(secondStart.getTime() + 30 * 60 * 1000)
        return (
            isWithinTeacherWorkingHours(workingHours, firstStart, firstEnd) ||
            isWithinTeacherWorkingHours(workingHours, secondStart, secondEnd)
        )
    }

    return (
        <div className="space-y-6">
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
                            <span>空き枠 下書き</span>
                            <span className="font-bold">{draftCount}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border bg-blue-50 px-3 py-2 text-blue-800">
                            <span>空き枠 公開中</span>
                            <span className="font-bold">{publicCount}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border bg-green-50 px-3 py-2 text-green-800">
                            <span>空き枠 予約済み</span>
                            <span className="font-bold">{bookedSlotCount}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border bg-emerald-50 px-3 py-2 text-emerald-800">
                            <span>レッスン予定</span>
                            <span className="font-bold">{lessonCount}</span>
                        </div>
                        <div className="rounded-lg border border-slate-300 bg-slate-100/60 px-3 py-2 text-slate-700">
                            第2レッスン室のグレー帯: サポート不在（通常レッスン不可）
                        </div>
                        <div className="rounded-lg border border-slate-300 bg-slate-200/70 px-3 py-2 text-slate-700">
                            両室の濃いグレー帯: 曜日別レッスン許可時間外
                        </div>
                    </div>
                </div>

                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <h3 className="text-sm font-bold text-blue-900">編集は専用画面で実施</h3>
                    <p className="text-xs text-blue-800">
                        第1レッスン室を主軸に、第2レッスン室（サポート/自主練）の稼働状況を確認できます。
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
                    {roomIds.map((roomId) => (
                        <div key={roomId} className="flex items-center justify-center gap-2 border-r p-4 text-center font-bold text-slate-700 last:border-r-0">
                            <LayoutGrid className="h-4 w-4 text-slate-400" />
                            {roomId === ROOMS.A.id ? ROOMS.A.name : ROOMS.B.name}
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

                        {roomIds.map((roomId) => {
                            const roomLessons = filteredLessons.filter((lesson) => (lesson.roomId || "A") === roomId)
                            const roomSlots = filteredSlots
                                .filter((slot) => slot.roomId === roomId)
                                .filter((slot) => {
                                    if (!slot.isBooked) return true
                                    return !roomLessons.some(
                                        (lesson) =>
                                            lesson.startTime.getTime() === slot.startTime.getTime() &&
                                            lesson.endTime.getTime() === slot.endTime.getTime()
                                    )
                                })

                            return (
                                <div key={roomId} className="relative border-r bg-slate-50/30 last:border-r-0">
                                    {HOURS.map((hour) => (
                                        <div key={hour} className="h-24 border-b" />
                                    ))}

                                    {roomId === "B" && HOURS.map((hour) => {
                                        const hourStart = new Date(selectedDate)
                                        hourStart.setHours(hour, 0, 0, 0)
                                        const hourEnd = new Date(selectedDate)
                                        hourEnd.setHours(hour + 1, 0, 0, 0)
                                        const hasSupport = shifts.some((shift) =>
                                            shift.startTime < hourEnd && shift.endTime > hourStart
                                        )
                                        if (hasSupport) return null
                                        return (
                                            <div
                                                key={`no-support-${hour}`}
                                                className="pointer-events-none absolute left-1 right-1 border border-dashed border-slate-300/70 bg-slate-100/40"
                                                style={{ top: `${(hour - hourRange.minHour) * 96}px`, height: "96px" }}
                                            />
                                        )
                                    })}

                                    {HOURS.map((hour) => {
                                        if (hasWorkingSlotAt(selectedDate, hour)) return null
                                        return (
                                            <div
                                                key={`outside-working-${roomId}-${hour}`}
                                                className="pointer-events-none absolute left-1 right-1 border border-slate-300/80 bg-slate-200/60"
                                                style={{ top: `${(hour - hourRange.minHour) * 96}px`, height: "96px", zIndex: 4 }}
                                            />
                                        )
                                    })}

                                    {HOURS.map((hour) => {
                                        const slotStart0 = new Date(selectedDate)
                                        slotStart0.setHours(hour, 0, 0, 0)
                                        const slotEnd0 = new Date(selectedDate)
                                        slotEnd0.setHours(hour, 30, 0, 0)
                                        const slotStart30 = new Date(selectedDate)
                                        slotStart30.setHours(hour, 30, 0, 0)
                                        const slotEnd30 = new Date(selectedDate)
                                        slotEnd30.setHours(hour + 1, 0, 0, 0)
                                        const closed0 = isSlotClosed(closedDays, slotStart0, slotEnd0)
                                        const closed30 = isSlotClosed(closedDays, slotStart30, slotEnd30)

                                        if (!closed0 && !closed30) return null

                                        if (closed0 && closed30) {
                                            return (
                                                <div
                                                    key={`closed-${roomId}-${hour}`}
                                                    className="pointer-events-none absolute left-1 right-1 rounded-lg border border-rose-200 bg-rose-100/60 flex items-center justify-center"
                                                    style={{ top: `${(hour - hourRange.minHour) * 96}px`, height: "96px", zIndex: 5 }}
                                                >
                                                    <span className="text-[10px] font-bold text-rose-500">お休み</span>
                                                </div>
                                            )
                                        }

                                        return [
                                            closed0 && (
                                                <div
                                                    key={`closed-${roomId}-${hour}-0`}
                                                    className="pointer-events-none absolute left-1 right-1 rounded-lg border border-rose-200 bg-rose-100/60 flex items-center justify-center"
                                                    style={{ top: `${(hour - hourRange.minHour) * 96}px`, height: "48px", zIndex: 5 }}
                                                >
                                                    <span className="text-[10px] font-bold text-rose-500">お休み</span>
                                                </div>
                                            ),
                                            closed30 && (
                                                <div
                                                    key={`closed-${roomId}-${hour}-30`}
                                                    className="pointer-events-none absolute left-1 right-1 rounded-lg border border-rose-200 bg-rose-100/60 flex items-center justify-center"
                                                    style={{ top: `${(hour - hourRange.minHour) * 96 + 48}px`, height: "48px", zIndex: 5 }}
                                                >
                                                    <span className="text-[10px] font-bold text-rose-500">お休み</span>
                                                </div>
                                            ),
                                        ]
                                    })}

                                    {roomSlots.map((slot) => {
                                        const startMin = slot.startTime.getHours() * 60 + slot.startTime.getMinutes()
                                        const offsetTop = ((startMin - hourRange.minHour * 60) / 60) * 96
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

                                    {roomLessons.map((lesson) => {
                                        const startMin = lesson.startTime.getHours() * 60 + lesson.startTime.getMinutes()
                                        const offsetTop = ((startMin - hourRange.minHour * 60) / 60) * 96
                                        const durationMin = (lesson.endTime.getTime() - lesson.startTime.getTime()) / 60000
                                        const height = (durationMin / 60) * 96
                                        const lessonTypeLabel =
                                            lesson.type === "PRACTICE"
                                                ? "自主練"
                                                : lesson.type === "SOLO_ADDITIONAL"
                                                    ? "ソロ"
                                                    : lesson.type === "DUET_ADDITIONAL"
                                                        ? "連弾"
                                                        : "通常"
                                        const lessonClass =
                                            lesson.type === "PRACTICE"
                                                ? "border-slate-300 bg-slate-100 text-slate-800"
                                                : lesson.type === "SOLO_ADDITIONAL"
                                                    ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                                                    : lesson.type === "DUET_ADDITIONAL"
                                                        ? "border-rose-300 bg-rose-50 text-rose-800"
                                                        : "border-emerald-300 bg-emerald-50 text-emerald-800"
                                        return (
                                            <div
                                                key={lesson.id}
                                                style={{ top: `${offsetTop}px`, height: `${height}px` }}
                                                className={cn("absolute left-1 right-1 rounded-lg border px-2 py-1 shadow-sm", lessonClass)}
                                            >
                                                <div className="text-[10px] font-bold">
                                                    {format(lesson.startTime, "HH:mm")} - {format(lesson.endTime, "HH:mm")}
                                                </div>
                                                <div className="mt-1 text-[10px] font-medium truncate">
                                                    {lesson.student?.name || "生徒未設定"}
                                                </div>
                                                <Badge variant="outline" className="mt-1 border-white/60 bg-white/60 text-[10px]">
                                                    {lessonTypeLabel}
                                                </Badge>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
            </div>
        </div>
    )
}
