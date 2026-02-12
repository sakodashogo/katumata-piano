"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { WEEKDAY_OPTIONS, ROOMS } from "@/lib/constants"
import { batchCreateOpenSlots } from "@/app/lib/actions/slot-management"
import {
    eachDayOfInterval,
    startOfMonth,
    endOfMonth,
    getDay,
    setHours,
    setMinutes,
    addMinutes,
} from "date-fns"

type Menu = {
    id: string
    name: string
    durationMin: number
}

type TimeRange = { start: string; end: string }

type Props = {
    year: number
    month: number
    menus: Menu[]
}

const TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => {
    const h = Math.floor(i / 2) + 9
    const m = (i % 2) * 30
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}).filter(t => {
    const h = parseInt(t.split(":")[0])
    return h <= 21
})

const DURATION_OPTIONS = [30, 45, 60]

export function BatchCreationForm({ year, month, menus }: Props) {
    const router = useRouter()
    const { toast } = useToast()
    const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([])
    const [timeRanges, setTimeRanges] = useState<TimeRange[]>([{ start: "10:00", end: "12:00" }])
    const [selectedRooms, setSelectedRooms] = useState<"A" | "B" | "both">("A")
    const [selectedMenuId, setSelectedMenuId] = useState<string>("")
    const [durationMin, setDurationMin] = useState(30)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const toggleWeekday = (day: number) => {
        setSelectedWeekdays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        )
    }

    const addTimeRange = () => {
        setTimeRanges(prev => [...prev, { start: "14:00", end: "17:00" }])
    }

    const removeTimeRange = (index: number) => {
        setTimeRanges(prev => prev.filter((_, i) => i !== index))
    }

    const updateTimeRange = (index: number, field: "start" | "end", value: string) => {
        setTimeRanges(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
    }

    // Preview count calculation
    const previewCount = useMemo(() => {
        if (selectedWeekdays.length === 0 || timeRanges.length === 0) return 0

        const monthStart = startOfMonth(new Date(year, month - 1))
        const monthEnd = endOfMonth(monthStart)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
        const matchingDays = allDays.filter(day => selectedWeekdays.includes(getDay(day)))

        let count = 0
        const roomCount = selectedRooms === "both" ? 2 : 1

        for (const day of matchingDays) {
            for (const range of timeRanges) {
                const [startH, startM] = range.start.split(":").map(Number)
                const [endH, endM] = range.end.split(":").map(Number)
                const rangeStart = setMinutes(setHours(day, startH), startM)
                const rangeEnd = setMinutes(setHours(day, endH), endM)

                let current = rangeStart
                while (addMinutes(current, durationMin) <= rangeEnd) {
                    count += roomCount
                    current = addMinutes(current, durationMin)
                }
            }
        }

        return count
    }, [selectedWeekdays, timeRanges, durationMin, selectedRooms, year, month])

    const handleSubmit = async () => {
        if (selectedWeekdays.length === 0) {
            toast.error("曜日を選択してください。")
            return
        }
        if (timeRanges.length === 0) {
            toast.error("時間帯を追加してください。")
            return
        }

        setIsSubmitting(true)
        const roomIds = selectedRooms === "both" ? ["A", "B"] : [selectedRooms]

        const result = await batchCreateOpenSlots({
            year,
            month,
            weekdays: selectedWeekdays,
            timeRanges,
            roomIds,
            menuId: selectedMenuId || undefined,
            durationMin,
        })

        setIsSubmitting(false)

        if (result.success) {
            toast.success(`${result.count}件の下書き枠を作成しました。`)
            router.refresh()
        } else {
            toast.error(result.error || "作成に失敗しました。")
        }
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
            <h2 className="text-lg font-bold text-slate-900">一括作成</h2>

            {/* Weekday selection */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">曜日選択</label>
                <div className="flex flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map(day => (
                        <button
                            key={day.value}
                            onClick={() => toggleWeekday(day.value)}
                            className={cn(
                                "w-12 h-10 rounded-lg text-sm font-medium transition-all border",
                                selectedWeekdays.includes(day.value)
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                            )}
                        >
                            {day.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Time ranges */}
            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">時間帯</label>
                {timeRanges.map((range, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <select
                            value={range.start}
                            onChange={(e) => updateTimeRange(index, "start", e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm bg-white"
                        >
                            {TIME_OPTIONS.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <span className="text-slate-400">〜</span>
                        <select
                            value={range.end}
                            onChange={(e) => updateTimeRange(index, "end", e.target.value)}
                            className="border rounded-md px-3 py-2 text-sm bg-white"
                        >
                            {TIME_OPTIONS.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        {timeRanges.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={() => removeTimeRange(index)} className="text-red-500 hover:text-red-700">
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTimeRange} className="text-blue-600">
                    <Plus className="h-4 w-4 mr-1" /> 時間帯を追加
                </Button>
            </div>

            {/* Room selection */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">教室</label>
                <div className="flex gap-3">
                    {[
                        { value: "A" as const, label: ROOMS.A.name },
                        { value: "B" as const, label: ROOMS.B.name },
                        { value: "both" as const, label: "両方" },
                    ].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="room"
                                value={opt.value}
                                checked={selectedRooms === opt.value}
                                onChange={() => setSelectedRooms(opt.value)}
                                className="text-blue-600"
                            />
                            <span className="text-sm">{opt.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Menu selection */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">メニュー</label>
                <select
                    value={selectedMenuId}
                    onChange={(e) => setSelectedMenuId(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm bg-white w-full max-w-xs"
                >
                    <option value="">指定なし</option>
                    {menus.map(menu => (
                        <option key={menu.id} value={menu.id}>{menu.name} ({menu.durationMin}分)</option>
                    ))}
                </select>
            </div>

            {/* Duration selection */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">1枠の時間</label>
                <div className="flex gap-2">
                    {DURATION_OPTIONS.map(d => (
                        <button
                            key={d}
                            onClick={() => setDurationMin(d)}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                                durationMin === d
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                            )}
                        >
                            {d}分
                        </button>
                    ))}
                </div>
            </div>

            {/* Preview */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="text-sm text-slate-600">
                    プレビュー: <span className="font-bold text-slate-900 text-lg">{previewCount}</span> 枠が作成されます
                </div>
                {previewCount > 0 && (
                    <div className="text-xs text-slate-400 mt-1">
                        {year}年{month}月の
                        {selectedWeekdays
                            .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                            .map(d => WEEKDAY_OPTIONS.find(w => w.value === d)?.label)
                            .join("・")}
                        曜日 × {timeRanges.map(r => `${r.start}-${r.end}`).join(", ")}
                    </div>
                )}
            </div>

            {/* Submit */}
            <Button
                onClick={handleSubmit}
                disabled={isSubmitting || previewCount === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            >
                {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 作成中...</>
                ) : (
                    <><Plus className="h-4 w-4 mr-2" /> 一括作成する</>
                )}
            </Button>
        </div>
    )
}
