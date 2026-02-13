"use client"

import * as React from "react"
import { addDays, format, setHours, setMinutes, startOfDay, startOfWeek } from "date-fns"
import { ja } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getStudentColorClasses } from "@/lib/student-color"
import { isSlotClosed, type ClosedDayRecord } from "@/lib/closed-days"

type LessonRow = {
    id: string
    studentId: string
    studentName: string
    startTime: Date | string
    endTime: Date | string
    roomId: string | null
    type?: string
    status: string
}

type SupportShift = {
    startTime: Date | string
    endTime: Date | string
}

type Props = {
    lessons: LessonRow[]
    supportShifts?: SupportShift[]
    closedDays?: ClosedDayRecord[]
    year: number
    month: number
}

const START_HOUR = 9
const END_HOUR = 22

type LessonCell = {
    studentId: string
    studentName: string
    status: string
}

export function MonthlyAllStudentsCalendar({
    lessons,
    supportShifts = [],
    closedDays = [],
    year,
    month,
}: Props) {
    const monthStart = new Date(year, month - 1, 1)
    const [weekStart, setWeekStart] = React.useState(() =>
        startOfWeek(monthStart, { weekStartsOn: 1 })
    )

    React.useEffect(() => {
        setWeekStart(startOfWeek(new Date(year, month - 1, 1), { weekStartsOn: 1 }))
    }, [year, month])

    const days = React.useMemo(
        () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
        [weekStart]
    )

    const timeSlots = React.useMemo(() => {
        const slots: { hour: number; minute: number; label: string }[] = []
        for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
            slots.push({ hour, minute: 0, label: `${hour}:00` })
            if (hour < END_HOUR) {
                slots.push({ hour, minute: 30, label: `${hour}:30` })
            }
        }
        return slots
    }, [])

    const getCellIso = (day: Date, hour: number, minute: number) =>
        setMinutes(setHours(startOfDay(day), hour), minute).toISOString()

    const lessonByCell = React.useMemo(() => {
        const map = new Map<string, LessonCell[]>()
        for (const lesson of lessons) {
            const start = new Date(lesson.startTime)
            if (Number.isNaN(start.getTime())) continue
            const roomId = lesson.roomId === "B" ? "B" : "A"
            const iso = start.toISOString()
            const key = `${roomId}:${iso}`
            const row = map.get(key) || []
            row.push({
                studentId: lesson.studentId,
                studentName: lesson.studentName || "名前未設定",
                status: lesson.status,
            })
            map.set(key, row)
        }
        return map
    }, [lessons])

    const parsedSupportShifts = React.useMemo(
        () => supportShifts.map((shift) => ({
            startTime: new Date(shift.startTime),
            endTime: new Date(shift.endTime),
        })),
        [supportShifts]
    )

    const hasSupportAt = React.useCallback((iso: string) => {
        const start = new Date(iso)
        const end = new Date(start.getTime() + 30 * 60 * 1000)
        return parsedSupportShifts.some((shift) => shift.startTime < end && shift.endTime > start)
    }, [parsedSupportShifts])

    const isDayInMonth = (day: Date) => day.getMonth() === month - 1 && day.getFullYear() === year

    const navigateWeek = (direction: "prev" | "next") => {
        setWeekStart((prev) => addDays(prev, direction === "next" ? 7 : -7))
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2">
                <div className="text-sm font-semibold text-slate-800">全生徒カレンダー（週表示）</div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek("prev")}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold">
                        {format(days[0], "M/d", { locale: ja })} - {format(days[6], "M/d", { locale: ja })}
                    </span>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigateWeek("next")}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">公開済み</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700">下書き</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-700">RoomB サポート不在</span>
            </div>

            <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[1180px] border-collapse text-center text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-slate-500">
                        <tr>
                            <th className="sticky left-0 z-30 w-14 border-r border-slate-200 bg-slate-50 px-1 py-1.5 text-[10px] font-medium">時間</th>
                            {days.map((day) => {
                                const inMonth = isDayInMonth(day)
                                const isSun = day.getDay() === 0
                                const isSat = day.getDay() === 6
                                return (
                                    <th
                                        key={day.toISOString()}
                                        className={cn("min-w-[136px] border-r border-slate-200 px-0 py-1 font-medium last:border-r-0", !inMonth && "opacity-35")}
                                    >
                                        <div className="flex flex-col items-center leading-tight">
                                            <span className={cn("text-[10px]", isSun && "text-red-500", isSat && "text-blue-500")}>
                                                {format(day, "E", { locale: ja })}
                                            </span>
                                            <span className={cn("text-sm font-bold", inMonth ? "text-slate-900" : "text-slate-400", isSun && inMonth && "text-red-600", isSat && inMonth && "text-blue-600")}>
                                                {format(day, "d")}
                                            </span>
                                            <div className="mt-0.5 grid w-full grid-cols-2 gap-[1px] px-1 text-[9px]">
                                                <span className="rounded bg-blue-50 py-0.5 font-semibold text-blue-700">A</span>
                                                <span className="rounded bg-emerald-50 py-0.5 font-semibold text-emerald-700">B</span>
                                            </div>
                                        </div>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {timeSlots.map(({ hour, minute, label }, rowIndex) => (
                            <tr key={`${hour}-${minute}`} className={cn(minute === 0 && rowIndex > 0 && "border-t border-slate-200")}>
                                <td className={cn("sticky left-0 z-10 w-14 border-r border-slate-200 bg-white px-1 py-0 text-[10px] font-medium text-slate-400", minute === 30 && "text-slate-300")}>
                                    {minute === 0 ? label : ""}
                                </td>
                                {days.map((day) => {
                                    const inMonth = isDayInMonth(day)
                                    return (
                                        <td key={day.toISOString()} className={cn("border-r p-0 last:border-r-0", minute === 0 ? "border-t border-slate-200" : "border-t border-slate-100")}>
                                            <div className={cn("grid h-[44px] grid-cols-2 gap-[1px] bg-slate-100 p-[1px]", !inMonth && "opacity-35")}>
                                                {(["A", "B"] as const).map((roomId) => {
                                                    const iso = getCellIso(day, hour, minute)
                                                    const slotStart = new Date(iso)
                                                    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000)
                                                    const isClosed = inMonth && isSlotClosed(closedDays, slotStart, slotEnd)
                                                    const rows = lessonByCell.get(`${roomId}:${iso}`) || []
                                                    const top = rows[0]
                                                    const remaining = rows.length - 1
                                                    const noSupport = roomId === "B" && !hasSupportAt(iso)
                                                    const isDraftTop = top?.status === "DRAFT"
                                                    return (
                                                        <div
                                                            key={`${day.toISOString()}-${roomId}`}
                                                            className={cn(
                                                                "flex h-full w-full items-center justify-center rounded-[2px] border border-slate-200 bg-white px-1 text-[9px]",
                                                                isClosed && "border-rose-200 bg-rose-100/70 text-rose-500",
                                                                !isClosed && noSupport && rows.length === 0 && "border-dashed border-slate-300 bg-slate-100 text-slate-500"
                                                            )}
                                                            title={rows.map((row) => row.studentName).join(", ")}
                                                        >
                                                            {isClosed ? (
                                                                "お休み"
                                                            ) : !top ? (
                                                                noSupport ? "補助不在" : ""
                                                            ) : (
                                                                <div
                                                                    className={cn(
                                                                        "flex w-full flex-col items-center justify-center rounded border px-1 py-0.5 leading-tight",
                                                                        getStudentColorClasses(top.studentId).bg,
                                                                        getStudentColorClasses(top.studentId).border,
                                                                        getStudentColorClasses(top.studentId).text
                                                                    )}
                                                                >
                                                                    <span className="w-full truncate text-center font-bold">{top.studentName}</span>
                                                                    <span
                                                                        className={cn(
                                                                            "mt-0.5 rounded px-1 text-[8px] font-semibold",
                                                                            isDraftTop ? "bg-amber-200 text-amber-800" : "bg-emerald-200 text-emerald-800"
                                                                        )}
                                                                    >
                                                                        {isDraftTop ? "下書き" : "公開"}
                                                                    </span>
                                                                    {remaining > 0 && <span className="text-[8px] font-semibold">+{remaining}</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
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
