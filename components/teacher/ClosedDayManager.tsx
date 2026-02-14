"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    format,
    isSameDay,
    startOfMonth,
    startOfWeek,
    endOfWeek,
    subMonths,
} from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react"
import {
    addClosedDay,
    addClosedDaysBulk,
    deleteClosedDay,
    deleteClosedDaysForMonth,
    publishClosedDaysForMonth,
} from "@/app/lib/actions/closed-day"

type ClosedDayRecord = {
    id: string
    date: Date
    startTime: string | null
    endTime: string | null
    reason: string | null
}

type Props = {
    initialYear: number
    initialMonth: number
    closedDays: ClosedDayRecord[]
    publicationStatus: {
        publishedAt: Date | string | null
        publishedBy: string | null
        draftCount: number
        publishedCount: number
        hasUnpublishedChanges: boolean
    }
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

export function ClosedDayManager({ initialYear, initialMonth, closedDays, publicationStatus }: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const [year, setYear] = useState(initialYear)
    const [month, setMonth] = useState(initialMonth)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isPublishing, setIsPublishing] = useState(false)

    // Bulk add state
    const [bulkWeekdays, setBulkWeekdays] = useState<number[]>([])
    const [bulkStartTime, setBulkStartTime] = useState("")
    const [bulkEndTime, setBulkEndTime] = useState("")
    const [bulkReason, setBulkReason] = useState("")

    const navigateMonth = (direction: "prev" | "next") => {
        const current = new Date(year, month - 1, 1)
        const target = direction === "prev" ? subMonths(current, 1) : addMonths(current, 1)
        const newYear = target.getFullYear()
        const newMonth = target.getMonth() + 1
        setYear(newYear)
        setMonth(newMonth)
        router.push(`/teacher/closed-days?year=${newYear}&month=${newMonth}`)
    }

    // Calendar grid data
    const monthStart = useMemo(() => startOfMonth(new Date(year, month - 1, 1)), [year, month])
    const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart])
    const calendarStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 0 }), [monthStart])
    const calendarEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 0 }), [monthEnd])
    const calendarDays = useMemo(
        () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
        [calendarStart, calendarEnd]
    )

    const getClosuresForDay = (day: Date) => {
        return closedDays.filter((cd) => isSameDay(new Date(cd.date), day))
    }

    const isWholeDayClosed = (day: Date) => {
        const closures = getClosuresForDay(day)
        return closures.some((cd) => !cd.startTime && !cd.endTime)
    }

    const hasPartialClosure = (day: Date) => {
        const closures = getClosuresForDay(day)
        return closures.some((cd) => cd.startTime && cd.endTime)
    }

    const handleDayClick = async (day: Date) => {
        if (isSubmitting) return
        if (day.getMonth() !== month - 1) return

        const wholeDayClosure = closedDays.find(
            (cd) => isSameDay(new Date(cd.date), day) && !cd.startTime && !cd.endTime
        )

        setIsSubmitting(true)
        try {
            if (wholeDayClosure) {
                // Remove whole-day closure
                const result = await deleteClosedDay(wholeDayClosure.id)
                if (result.success) {
                    toast.success(`${format(day, "M/d")} のお休みを解除しました`)
                } else {
                    toast.error(result.error || "削除に失敗しました")
                }
            } else {
                // Add whole-day closure
                const result = await addClosedDay({
                    date: format(day, "yyyy-MM-dd"),
                })
                if (result.success) {
                    toast.success(`${format(day, "M/d")} を終日お休みにしました`)
                } else {
                    toast.error(result.error || "登録に失敗しました")
                }
            }
            router.refresh()
        } catch {
            toast.error("エラーが発生しました")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleBulkAdd = async () => {
        if (isSubmitting || bulkWeekdays.length === 0) return

        setIsSubmitting(true)
        try {
            const result = await addClosedDaysBulk({
                year,
                month,
                weekdays: bulkWeekdays,
                startTime: bulkStartTime || null,
                endTime: bulkEndTime || null,
                reason: bulkReason || null,
            })
            if (result.success) {
                toast.success(`${result.created}件追加 / ${result.skipped}件スキップ`)
                setBulkWeekdays([])
                setBulkStartTime("")
                setBulkEndTime("")
                setBulkReason("")
                router.refresh()
            } else {
                toast.error(result.error || "一括追加に失敗しました")
            }
        } catch {
            toast.error("エラーが発生しました")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleClearMonth = async () => {
        if (isSubmitting) return
        if (!confirm(`${year}年${month}月のお休みをすべて削除しますか？`)) return

        setIsSubmitting(true)
        try {
            const result = await deleteClosedDaysForMonth(year, month)
            if (result.success) {
                toast.success(`${result.deleted}件のお休みを削除しました`)
                router.refresh()
            } else {
                toast.error(result.error || "削除に失敗しました")
            }
        } catch {
            toast.error("エラーが発生しました")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeleteSingle = async (id: string) => {
        if (isSubmitting) return

        setIsSubmitting(true)
        try {
            const result = await deleteClosedDay(id)
            if (result.success) {
                toast.success("お休みを削除しました")
                router.refresh()
            } else {
                toast.error(result.error || "削除に失敗しました")
            }
        } catch {
            toast.error("エラーが発生しました")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handlePublishMonth = async () => {
        if (isPublishing || isSubmitting) return
        setIsPublishing(true)
        try {
            const result = await publishClosedDaysForMonth(year, month)
            if (result.success) {
                toast.success(`${result.publishedCount}件のお休みを生徒画面へ公開しました`)
                router.refresh()
            } else {
                toast.error(result.error || "公開に失敗しました")
            }
        } catch {
            toast.error("公開処理でエラーが発生しました")
        } finally {
            setIsPublishing(false)
        }
    }

    const toggleBulkWeekday = (dayIndex: number) => {
        setBulkWeekdays((prev) =>
            prev.includes(dayIndex)
                ? prev.filter((d) => d !== dayIndex)
                : [...prev, dayIndex]
        )
    }

    const sortedClosedDays = useMemo(() => {
        return [...closedDays].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
    }, [closedDays])

    return (
        <div className="space-y-6">
            {/* Month Navigation */}
            <div className="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-md border bg-slate-50">
                        <Button
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => navigateMonth("prev")}
                            disabled={isSubmitting}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-4 font-bold text-lg min-w-[140px] text-center">
                            {year}年 {month}月
                        </span>
                        <Button
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => navigateMonth("next")}
                            disabled={isSubmitting}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                    onClick={handleClearMonth}
                    disabled={isSubmitting || isPublishing || closedDays.length === 0}
                >
                    <Trash2 className="h-4 w-4 mr-1" />
                    月のお休みをクリア
                </Button>
            </div>

            <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <h3 className="font-bold text-sm text-slate-800">公開状態</h3>
                        <p className="text-xs text-slate-500">
                            生徒側には公開済みのお休みのみ反映されます。
                        </p>
                    </div>
                    <Button
                        onClick={handlePublishMonth}
                        disabled={isPublishing || isSubmitting}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        size="sm"
                    >
                        <Upload className="h-4 w-4 mr-1" />
                        {isPublishing ? "公開中..." : "この月のお休みを公開"}
                    </Button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                    <div className="rounded border bg-slate-50 px-3 py-2">
                        下書き件数: <span className="font-semibold text-slate-800">{publicationStatus.draftCount}</span>
                    </div>
                    <div className="rounded border bg-slate-50 px-3 py-2">
                        公開済み件数: <span className="font-semibold text-slate-800">{publicationStatus.publishedCount}</span>
                    </div>
                    <div className="rounded border bg-slate-50 px-3 py-2">
                        公開日時:{" "}
                        <span className="font-semibold text-slate-800">
                            {publicationStatus.publishedAt
                                ? format(new Date(publicationStatus.publishedAt), "yyyy/MM/dd HH:mm")
                                : "未公開"}
                        </span>
                    </div>
                    <div className={cn(
                        "rounded border px-3 py-2",
                        publicationStatus.hasUnpublishedChanges
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    )}>
                        {publicationStatus.hasUnpublishedChanges ? "未公開変更あり" : "公開内容と一致"}
                        {publicationStatus.publishedBy && (
                            <span className="ml-1 text-[11px] text-slate-600">({publicationStatus.publishedBy})</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Bulk Add Controls */}
            <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-slate-800">曜日パターンで一括追加</h3>

                <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, idx) => (
                        <button
                            key={idx}
                            onClick={() => toggleBulkWeekday(idx)}
                            className={cn(
                                "w-10 h-10 rounded-lg text-sm font-bold transition-colors border",
                                bulkWeekdays.includes(idx)
                                    ? "bg-rose-500 text-white border-rose-500"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500">開始時刻（空欄=終日）</label>
                        <input
                            type="time"
                            value={bulkStartTime}
                            onChange={(e) => setBulkStartTime(e.target.value)}
                            className="h-9 w-full rounded-md border px-3 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500">終了時刻（空欄=終日）</label>
                        <input
                            type="time"
                            value={bulkEndTime}
                            onChange={(e) => setBulkEndTime(e.target.value)}
                            className="h-9 w-full rounded-md border px-3 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500">理由（任意）</label>
                        <input
                            type="text"
                            value={bulkReason}
                            onChange={(e) => setBulkReason(e.target.value)}
                            placeholder="例: 祝日、発表会準備"
                            className="h-9 w-full rounded-md border px-3 text-sm"
                        />
                    </div>
                </div>

                <Button
                    onClick={handleBulkAdd}
                    disabled={isSubmitting || isPublishing || bulkWeekdays.length === 0}
                    className="bg-rose-600 text-white hover:bg-rose-700"
                    size="sm"
                >
                    一括追加
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Calendar View */}
                <div className="rounded-lg border bg-white p-4 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-800 mb-3">カレンダー</h3>
                    <p className="text-xs text-slate-500 mb-4">日付をクリックで終日お休みをトグルします</p>

                    <div className="grid grid-cols-7 gap-1">
                        {WEEKDAY_LABELS.map((label) => (
                            <div
                                key={label}
                                className="text-center text-xs font-bold text-slate-500 py-1"
                            >
                                {label}
                            </div>
                        ))}

                        {calendarDays.map((day) => {
                            const isCurrentMonth = day.getMonth() === month - 1
                            const wholeDay = isWholeDayClosed(day)
                            const partial = hasPartialClosure(day)
                            const closures = getClosuresForDay(day)
                            const today = isSameDay(day, new Date())

                            return (
                                <button
                                    key={day.toISOString()}
                                    onClick={() => handleDayClick(day)}
                                    disabled={!isCurrentMonth || isSubmitting || isPublishing}
                                    className={cn(
                                        "relative aspect-square rounded-lg p-1 text-sm transition-colors border",
                                        !isCurrentMonth && "opacity-30 cursor-default",
                                        isCurrentMonth && !wholeDay && !partial && "hover:bg-slate-50 border-transparent",
                                        wholeDay && "bg-rose-100 border-rose-300 hover:bg-rose-200",
                                        !wholeDay && partial && "bg-rose-50 border-rose-200 hover:bg-rose-100",
                                        today && !wholeDay && "ring-2 ring-blue-400",
                                    )}
                                >
                                    <span className={cn(
                                        "font-bold",
                                        wholeDay ? "text-rose-700" : isCurrentMonth ? "text-slate-700" : "text-slate-400",
                                    )}>
                                        {format(day, "d")}
                                    </span>
                                    {wholeDay && (
                                        <div className="absolute bottom-0.5 left-0.5 right-0.5 text-[8px] font-bold text-rose-600 truncate">
                                            終日休
                                        </div>
                                    )}
                                    {!wholeDay && partial && (
                                        <div className="absolute bottom-0.5 left-0.5 right-0.5 text-[8px] font-bold text-rose-500 truncate">
                                            一部休
                                        </div>
                                    )}
                                    {closures.length > 0 && closures[0].reason && (
                                        <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-rose-400" title={closures[0].reason} />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* List View */}
                <div className="rounded-lg border bg-white shadow-sm">
                    <div className="border-b p-4">
                        <h3 className="font-bold text-sm text-slate-800">お休み一覧</h3>
                        <p className="text-xs text-slate-500">{closedDays.length}件</p>
                    </div>

                    <div className="max-h-[400px] overflow-auto">
                        {sortedClosedDays.length === 0 ? (
                            <div className="p-6 text-center text-sm text-slate-500">
                                お休みは設定されていません
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">日付</th>
                                        <th className="px-3 py-2 text-left">時間</th>
                                        <th className="px-3 py-2 text-left">理由</th>
                                        <th className="px-3 py-2 text-right w-16"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedClosedDays.map((cd) => (
                                        <tr key={cd.id} className="border-t hover:bg-slate-50">
                                            <td className="px-3 py-2 text-slate-700">
                                                {format(new Date(cd.date), "M/d (E)", { locale: ja })}
                                            </td>
                                            <td className="px-3 py-2 text-slate-700">
                                                {cd.startTime && cd.endTime
                                                    ? `${cd.startTime} - ${cd.endTime}`
                                                    : "終日"}
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">
                                                {cd.reason || "-"}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <button
                                                    onClick={() => handleDeleteSingle(cd.id)}
                                                    disabled={isSubmitting || isPublishing}
                                                    className="text-rose-500 hover:text-rose-700 disabled:opacity-50"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
