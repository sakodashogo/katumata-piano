"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { format, setHours, setMinutes, isSameDay, startOfDay } from "date-fns"
import { ja } from "date-fns/locale"
import { Loader2 } from "lucide-react"

type Lesson = {
    id: string
    startTime: Date | string
    endTime: Date | string
    // ...
}

type Props = {
    studentName: string
    availableSlots: string[]
    unavailableSlots: string[]
    existingLessons: Lesson[]
    year: number
    month: number
    onSave: (lessons: { startTime: Date, endTime: Date }[]) => Promise<boolean>
    isOpen: boolean
    onClose: () => void
}

export function SchedulingCalendar({
    studentName,
    availableSlots,
    unavailableSlots,
    existingLessons,
    year,
    month,
    onSave,
    isOpen,
    onClose
}: Props) {
    const [date, setDate] = React.useState<Date | undefined>(new Date(year, month - 1, 1))
    const [selectedDate, setSelectedDate] = React.useState<Date | null>(null)
    const [isDayDialogOpen, setIsDayDialogOpen] = React.useState(false)

    // Draft lessons to be created
    const [draftSlots, setDraftSlots] = React.useState<Set<string>>(new Set())
    const [isSaving, setIsSaving] = React.useState(false)

    React.useEffect(() => {
        setDate(new Date(year, month - 1, 1))
        setDraftSlots(new Set()) // Reset drafts when student/month changes
    }, [year, month, isOpen]) // Simple reset

    const handleDayClick = (day: Date) => {
        setSelectedDate(day)
        setIsDayDialogOpen(true)
    }

    const toggleDraft = (slotIso: string) => {
        const newDrafts = new Set(draftSlots)
        if (newDrafts.has(slotIso)) {
            newDrafts.delete(slotIso)
        } else {
            newDrafts.add(slotIso)
        }
        setDraftSlots(newDrafts)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const lessons = Array.from(draftSlots).map(iso => {
                const start = new Date(iso)
                const end = setMinutes(start, start.getMinutes() + 30) // Assuming 30 mins
                return { startTime: start, endTime: end }
            })
            const success = await onSave(lessons)
            if (success) {
                setDraftSlots(new Set())
                onClose()
            }
        } finally {
            setIsSaving(false)
        }
    }

    // Checking status
    const availableSet = new Set(availableSlots)
    const unavailableSet = new Set(unavailableSlots)

    const getSlotStatus = (iso: string) => {
        // Check if existing lesson covers this slot
        const slotStart = new Date(iso)
        const isBooked = existingLessons.some(l => {
            const lStart = new Date(l.startTime)
            return lStart.getTime() === slotStart.getTime() // Simple match
        })

        if (isBooked) return 'booked'
        if (draftSlots.has(iso)) return 'draft'
        if (availableSet.has(iso)) return 'available'
        if (unavailableSet.has(iso)) return 'unavailable'
        return 'neutral'
    }

    const timeSlots = React.useMemo(() => {
        if (!selectedDate) return []
        const slots = []
        let current = setMinutes(setHours(startOfDay(selectedDate), 9), 0)
        const end = setMinutes(setHours(startOfDay(selectedDate), 22), 0)

        while (current <= end) {
            slots.push(current.toISOString())
            current = setMinutes(current, current.getMinutes() + 30)
        }
        return slots
    }, [selectedDate])

    // Modifiers for calendar dots
    const modifiers = {
        hasAvailable: (date: Date) => availableSlots.some(s => isSameDay(new Date(s), date)),
        hasBooked: (date: Date) => existingLessons.some(l => isSameDay(new Date(l.startTime), date)),
        hasDraft: (date: Date) => Array.from(draftSlots).some(s => isSameDay(new Date(s), date))
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{studentName} - レッスン作成 ({year}年{month}月)</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 flex justify-center">
                        <Calendar
                            mode="single"
                            month={new Date(year, month - 1, 1)}
                            selected={date}
                            onSelect={setDate}
                            onDayClick={handleDayClick}
                            locale={ja}
                            modifiers={modifiers}
                            modifiersClassNames={{
                                hasBooked: "text-blue-600 font-bold",
                                hasDraft: "bg-blue-100 text-blue-900",
                                hasAvailable: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-green-500 after:rounded-full",
                            }}
                            disableNavigation
                        />
                    </div>
                </div>

                <DialogFooter>
                    <div className="flex justify-between w-full items-center">
                        <div className="text-sm text-muted-foreground">
                            {draftSlots.size}件のレッスンを作成予定
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose}>キャンセル</Button>
                            <Button onClick={handleSave} disabled={isSaving || draftSlots.size === 0}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                作成する
                            </Button>
                        </div>
                    </div>
                </DialogFooter>

                <Dialog open={isDayDialogOpen} onOpenChange={setIsDayDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {selectedDate ? format(selectedDate, "M月d日 (E)", { locale: ja }) : ""}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-3 gap-2 py-4">
                            {timeSlots.map((slotIso) => {
                                const status = getSlotStatus(slotIso)
                                const timeLabel = format(new Date(slotIso), "H:mm")
                                const isDraft = status === 'draft'
                                const isBooked = status === 'booked'
                                const isAvailable = status === 'available'
                                const isUnavailable = status === 'unavailable'

                                return (
                                    <Button
                                        key={slotIso}
                                        variant="outline"
                                        className={cn(
                                            "h-auto py-2 flex flex-col gap-1",
                                            isDraft && "bg-blue-600 text-white hover:bg-blue-700 hover:text-white border-blue-600",
                                            isBooked && "bg-gray-100 text-gray-400 cursor-not-allowed hover:bg-gray-100",
                                            !isDraft && !isBooked && isAvailable && "bg-green-50 border-green-200 hover:bg-green-100",
                                            !isDraft && !isBooked && isUnavailable && "bg-red-50 border-red-200 hover:bg-red-100"
                                        )}
                                        disabled={isBooked}
                                        onClick={() => toggleDraft(slotIso)}
                                    >
                                        <span className="text-sm font-bold">{timeLabel}</span>
                                        <span className="text-xs">
                                            {isBooked ? "予約済" :
                                                isDraft ? "追加" :
                                                    isAvailable ? "◯" :
                                                        isUnavailable ? "✕" : "-"}
                                        </span>
                                    </Button>
                                )
                            })}
                        </div>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    )
}
