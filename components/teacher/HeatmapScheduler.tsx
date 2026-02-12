
"use client"

import { useState, useMemo } from "react"
import { format, startOfWeek, endOfWeek, addDays, getDay, setHours, setMinutes, isSameDay } from "date-fns"
import { ja } from "date-fns/locale"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, X, Users, Wand2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ScheduleSuggestion } from "@/app/lib/actions/schedule-maker"

type Props = {
    suggestions: ScheduleSuggestion[]
    students: { id: string, name: string | null }[]
    year: number
    month: number
    onConfirm: (selectedSuggestions: ScheduleSuggestion[]) => void
    onCancel: () => void
}

const HOURS = [14, 15, 16, 17, 18, 19]
const MINUTES = [0, 30]

export function HeatmapScheduler({ suggestions, students, year, month, onConfirm, onCancel }: Props) {
    // State to track rejected slots (user can uncheck suggestions)
    const [rejectedSlots, setRejectedSlots] = useState<Set<string>>(new Set())

    // Generate calendar grid for the month
    const calendarDays = useMemo(() => {
        const start = new Date(year, month - 1, 1)
        const end = new Date(year, month, 0)
        const days = []
        let current = start
        while (current <= end) {
            if (getDay(current) !== 0) { // Skip Sundays
                days.push(current)
            }
            current = addDays(current, 1)
        }
        return days
    }, [year, month])

    // Helper to get suggestions for a specific slot
    const getSlotSuggestions = (date: Date, hour: number, minute: number) => {
        const slotTime = setMinutes(setHours(date, hour), minute).getTime()
        return suggestions.filter(s => new Date(s.slot.startTime).getTime() === slotTime)
    }

    // Identify conflicts (slots with multiple students)
    const getConflictStatus = (slotSuggestions: ScheduleSuggestion[]) => {
        if (slotSuggestions.length === 0) return "empty"
        if (slotSuggestions.length === 1) return "single"
        return "conflict"
    }

    const toggleRejection = (suggestion: ScheduleSuggestion) => {
        const key = `${suggestion.studentId}-${new Date(suggestion.slot.startTime).toISOString()}`
        const newRejected = new Set(rejectedSlots)
        if (newRejected.has(key)) {
            newRejected.delete(key)
        } else {
            newRejected.add(key)
        }
        setRejectedSlots(newRejected)
    }

    const finalSuggestions = suggestions.filter(s => {
        const key = `${s.studentId}-${new Date(s.slot.startTime).toISOString()}`
        return !rejectedSlots.has(key)
    })

    const handleConfirm = () => {
        // We only confirm non-conflicting ones? Or allow all?
        // Ideally, user should resolve conflicts before confirming.
        // For MVP, we pass all "Active" suggestions. 
        // Backend handles actual creation (might fail if duplicate key, but loose mostly).
        onConfirm(finalSuggestions)
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border">
                <div>
                    <h3 className="font-bold flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-purple-600" />
                        自動提案・ヒートマップ調整
                    </h3>
                    <p className="text-sm text-slate-500">
                        色の濃い箇所は希望が重複しています。クリックして調整してください。
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="text-right mr-4">
                        <div className="text-sm font-medium">選択中: {finalSuggestions.length}件</div>
                    </div>
                    <Button variant="outline" onClick={onCancel}>キャンセル</Button>
                    <Button onClick={handleConfirm} disabled={finalSuggestions.length === 0}>
                        確定して作成
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-[600px] border rounded-md">
                <div className="p-4 min-w-[800px]">
                    <div className="grid grid-cols-[100px_1fr] gap-4">
                        {/* Header */}
                        <div className="sticky top-0 bg-white z-10 pt-2"></div>
                        <div className="sticky top-0 bg-white z-10 grid grid-cols-6 gap-2 text-center pb-2 border-b">
                            {["月", "火", "水", "木", "金", "土"].map(d => (
                                <div key={d} className="font-bold text-slate-700">{d}</div>
                            ))}
                        </div>

                        {/* Time Rows? No, Date Rows might be better for Month view? 
                            Actually, simpler to show Day Columns (Mon-Sat) and Date Rows?
                            Or standard calendar grid?
                            Let's do List of Days grouped by Week?
                            
                            Let's try: Rows = Dates, Cols = Times (14:00 - 19:30).
                        */}
                    </div>

                    <div className="space-y-1">
                        {calendarDays.map(day => (
                            <div key={day.toISOString()} className="grid grid-cols-[100px_1fr] border-b py-2">
                                <div className="text-sm font-medium text-slate-600 py-2">
                                    {format(day, "M/d (E)", { locale: ja })}
                                </div>
                                <div className="grid grid-cols-12 gap-1">
                                    {HOURS.map(h => (
                                        MINUTES.map(m => {
                                            const slotSuggs = getSlotSuggestions(day, h, m)
                                            const status = getConflictStatus(slotSuggs)
                                            const isConflict = status === "conflict"
                                            const count = slotSuggs.length

                                            // Determine active suggestions for this slot
                                            const activeSuggs = slotSuggs.filter(s => {
                                                const key = `${s.studentId}-${new Date(s.slot.startTime).toISOString()}`
                                                return !rejectedSlots.has(key)
                                            })
                                            const activeCount = activeSuggs.length

                                            let colorClass = "bg-slate-50 border-slate-100"
                                            if (activeCount === 1) colorClass = "bg-blue-100 border-blue-200 text-blue-700"
                                            if (activeCount > 1) colorClass = "bg-red-100 border-red-200 text-red-700 font-bold"
                                            if (count > 0 && activeCount === 0) colorClass = "bg-gray-100 text-gray-400 border-dashed" // All rejected

                                            return (
                                                <TooltipProvider key={`${h}-${m}`}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div
                                                                className={cn(
                                                                    "h-10 rounded border text-xs flex items-center justify-center cursor-pointer transition-colors relative",
                                                                    colorClass
                                                                )}
                                                                onClick={() => {
                                                                    // If collision, maybe open detailed view or cycle?
                                                                    // For now, toggle all?
                                                                    // Better: Dropdown to pick winner?
                                                                }}
                                                            >
                                                                <span className="z-10">{format(setMinutes(setHours(day, h), m), "HH:mm")}</span>
                                                                {activeCount > 0 && (
                                                                    <Badge variant="secondary" className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                                                                        {activeCount}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className="space-y-2">
                                                                <p className="font-bold border-b pb-1">希望者 ({count}名)</p>
                                                                {slotSuggs.map(s => {
                                                                    const key = `${s.studentId}-${new Date(s.slot.startTime).toISOString()}`
                                                                    const isRejected = rejectedSlots.has(key)
                                                                    return (
                                                                        <div key={s.studentId} className="flex items-center justify-between gap-2 text-sm">
                                                                            <span className={isRejected ? "text-slate-400 line-through" : ""}>
                                                                                {
                                                                                    // Lookup student name
                                                                                    students.find(stu => stu.id === s.studentId)?.name || "不明な生徒"
                                                                                }
                                                                            </span>
                                                                            <Button
                                                                                size="sm"
                                                                                variant="ghost"
                                                                                className="h-4 w-4 p-0"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    toggleRejection(s)
                                                                                }}
                                                                            >
                                                                                {isRejected ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                                                            </Button>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )
                                        })
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}
