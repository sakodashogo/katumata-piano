"use client"

import { useState, useMemo, useEffect } from "react"
import { format, addDays, getDay, setHours, setMinutes } from "date-fns"
import { ja } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, Users, Wand2 } from "lucide-react"
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

// Color palette for students
const STUDENT_COLORS = [
    "bg-red-100 text-red-900 border-red-200 hover:bg-red-200",
    "bg-orange-100 text-orange-900 border-orange-200 hover:bg-orange-200",
    "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200",
    "bg-yellow-100 text-yellow-900 border-yellow-200 hover:bg-yellow-200",
    "bg-lime-100 text-lime-900 border-lime-200 hover:bg-lime-200",
    "bg-green-100 text-green-900 border-green-200 hover:bg-green-200",
    "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-200",
    "bg-teal-100 text-teal-900 border-teal-200 hover:bg-teal-200",
    "bg-cyan-100 text-cyan-900 border-cyan-200 hover:bg-cyan-200",
    "bg-sky-100 text-sky-900 border-sky-200 hover:bg-sky-200",
    "bg-blue-100 text-blue-900 border-blue-200 hover:bg-blue-200",
    "bg-indigo-100 text-indigo-900 border-indigo-200 hover:bg-indigo-200",
    "bg-violet-100 text-violet-900 border-violet-200 hover:bg-violet-200",
    "bg-purple-100 text-purple-900 border-purple-200 hover:bg-purple-200",
    "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200 hover:bg-fuchsia-200",
    "bg-pink-100 text-pink-900 border-pink-200 hover:bg-pink-200",
    "bg-rose-100 text-rose-900 border-rose-200 hover:bg-rose-200",
]

export function HeatmapScheduler({ suggestions, students, year, month, onConfirm, onCancel }: Props) {
    // State to track SELECTED slots (initialized with Recommended ones)
    const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set())

    // Map student IDs to colors
    const studentColorMap = useMemo(() => {
        const map = new Map<string, string>()
        students.forEach((s, i) => {
            map.set(s.id, STUDENT_COLORS[i % STUDENT_COLORS.length])
        })
        return map
    }, [students])

    // Initialize selection when suggestions change
    useEffect(() => {
        const recommended = suggestions.filter(s => s.isRecommended).map(s => s.id)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedSlotIds(new Set(recommended))
    }, [suggestions])

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

    const toggleSelection = (suggestionId: string) => {
        const newSelected = new Set(selectedSlotIds)
        if (newSelected.has(suggestionId)) {
            newSelected.delete(suggestionId)
        } else {
            newSelected.add(suggestionId)
        }
        setSelectedSlotIds(newSelected)
    }

    // Helper for rendering suggestion item
    const SuggestionItem = ({ s }: { s: ScheduleSuggestion }) => {
        const isSelected = selectedSlotIds.has(s.id)
        const studentName = students.find(stu => stu.id === s.studentId)?.name || "不明"
        const colorClass = studentColorMap.get(s.studentId) || "bg-slate-100"

        return (
            <div
                className={cn(
                    "flex items-center justify-between gap-2 text-sm p-2 rounded cursor-pointer border mb-1",
                    isSelected ? colorClass : "bg-white border-slate-200 hover:bg-slate-50"
                )}
                onClick={(e) => {
                    e.stopPropagation()
                    toggleSelection(s.id)
                }}
            >
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "w-4 h-4 rounded-full border flex items-center justify-center bg-white",
                        isSelected ? "border-current" : "border-slate-300"
                    )}>
                        {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="font-medium">
                        {studentName}
                    </span>
                    <span className="rounded bg-white/70 px-1 text-[10px] font-semibold text-slate-700">
                        Room {s.slot.roomId}
                    </span>
                </div>
                {s.isRecommended && <Badge variant="outline" className="text-[10px] px-1 h-4 bg-white/50 border-current opacity-70">推奨</Badge>}
            </div>
        )
    }

    const finalSuggestions = suggestions.filter(s => selectedSlotIds.has(s.id))

    const handleConfirm = () => {
        onConfirm(finalSuggestions)
    }

    // Metrics
    const totalSelected = finalSuggestions.length

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border">
                <div>
                    <h3 className="font-bold flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-purple-600" />
                        自動提案・ヒートマップ調整
                    </h3>
                    <p className="text-sm text-slate-500">
                        推奨パターンが自動選択されています。生徒ごとに色分け表示されています。
                    </p>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="text-right mr-4 text-sm">
                        <span className="font-bold text-lg">{totalSelected}</span> コマ選択中
                    </div>
                    <Button variant="outline" onClick={onCancel}>キャンセル</Button>
                    <Button onClick={handleConfirm} disabled={totalSelected === 0}>
                        確定して作成
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-[600px] border rounded-md">
                <div className="p-4 min-w-[800px]">
                    <div className="grid grid-cols-[100px_1fr] gap-4">
                        <div className="sticky top-0 bg-white z-10 pt-2"></div>
                        <div className="sticky top-0 bg-white z-10 grid grid-cols-[100px_repeat(6,_1fr)] gap-2 text-center pb-2 border-b shadow-sm">
                            {/* Empty top-left cell */}
                            <div></div>
                            {/* Weekdays */}
                            {["月", "火", "水", "木", "金", "土"].map(d => (
                                <div key={d} className="font-bold text-slate-700">{d}</div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1">
                        {calendarDays.map(day => (
                            <div key={day.toISOString()} className="grid grid-cols-[100px_1fr] border-b py-2">
                                <div className="text-sm font-medium text-slate-600 py-2 pl-2 flex items-center">
                                    {format(day, "M/d (E)", { locale: ja })}
                                </div>
                                <div className="grid grid-cols-12 gap-1 place-items-start w-full pr-2">
                                    {HOURS.map(h => (
                                        MINUTES.map(m => {
                                            const slotSuggs = getSlotSuggestions(day, h, m)
                                            const count = slotSuggs.length

                                            // Empty Slot (No suggestions)
                                            if (count === 0) {
                                                return (
                                                    <div key={`${h}-${m}`} className="w-full h-10 rounded border border-slate-100 bg-slate-50 flex items-center justify-center text-xs text-slate-300">
                                                        {format(setMinutes(setHours(day, h), m), "HH:mm")}
                                                    </div>
                                                )
                                            }

                                            // Determine visualization based on SELECTION and CONFLICT
                                            const selectedInSlot = slotSuggs.filter(s => selectedSlotIds.has(s.id))
                                            const selectedCount = selectedInSlot.length

                                            // Status Logic
                                            let bgClass = "bg-white"
                                            let borderClass = "border-slate-200"
                                            let textClass = "text-slate-500"
                                            let content = <span className="z-10">{format(setMinutes(setHours(day, h), m), "HH:mm")}</span>

                                            if (selectedCount === 1) {
                                                const s = selectedInSlot[0]
                                                const student = students.find(stu => stu.id === s.studentId)
                                                // Get color for this student
                                                const colorClass = studentColorMap.get(s.studentId) || ""

                                                bgClass = colorClass
                                                borderClass = "border-transparent"
                                                textClass = ""

                                                // Show Student Name instead of Time
                                                content = (
                                                    <span className="z-10 font-bold truncate w-full text-center px-1 text-[11px]">
                                                        {student?.name || "不明"}
                                                    </span>
                                                )
                                            } else if (selectedCount > 1) {
                                                // Conflict created by user selection
                                                bgClass = "bg-red-500"
                                                borderClass = "border-red-600"
                                                textClass = "text-white font-bold"
                                                content = <span className="z-10 flex items-center gap-1"><Users className="h-3 w-3" /> 重複</span>
                                            } else {
                                                // None selected, but options exist
                                                bgClass = "bg-slate-100"
                                                borderClass = "border-dashed border-slate-300"
                                                textClass = "text-slate-400"
                                            }

                                            return (
                                                <TooltipProvider key={`${h}-${m}`}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className={cn(
                                                                "w-full h-10 rounded border text-xs flex items-center justify-center cursor-pointer transition-all relative hover:ring-2 hover:ring-slate-400 overflow-hidden",
                                                                bgClass, borderClass, textClass
                                                            )}>
                                                                {content}

                                                                {/* Indicators */}
                                                                {count > 0 && selectedCount === 0 && (
                                                                    <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-slate-400" />
                                                                )}
                                                                {selectedCount > 0 && (
                                                                    <Badge variant="secondary" className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-white shadow-sm ring-1 ring-slate-200 text-slate-700">
                                                                        {selectedCount}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="p-0 border-0 shadow-lg" sideOffset={5}>
                                                            <div className="bg-white p-3 rounded-md border min-w-[200px]">
                                                                <div className="font-bold text-xs text-slate-500 mb-2 border-b pb-1">
                                                                    時間: {format(setMinutes(setHours(day, h), m), "HH:mm")} (候補: {count}名)
                                                                </div>
                                                                <div className="space-y-1">
                                                                    {slotSuggs.map(s => (
                                                                        <SuggestionItem key={s.id} s={s} />
                                                                    ))}
                                                                </div>
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
