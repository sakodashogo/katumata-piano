"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { format, setHours, setMinutes, isSameDay, startOfMonth, startOfDay, addMonths, subMonths } from "date-fns"
import { ja } from "date-fns/locale"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"

type AvailabilityCalendarProps = {
    initialAvailableSlots: string[]
    initialUnavailableSlots: string[]
    year: number
    month: number
    onSave: (year: number, month: number, data: { availableSlots: string[], unavailableSlots: string[] }) => Promise<{ success: boolean, error?: string }>
    onMonthChange: (year: number, month: number) => void
    readOnly?: boolean
}

export function AvailabilityCalendar({
    initialAvailableSlots,
    initialUnavailableSlots,
    year,
    month,
    onSave,
    onMonthChange,
    readOnly = false
}: AvailabilityCalendarProps) {
    const [date, setDate] = React.useState<Date | undefined>(new Date(year, month - 1, 1))
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [selectedDate, setSelectedDate] = React.useState<Date | null>(null)

    // State for local changes
    const [availableSlots, setAvailableSlots] = React.useState<Set<string>>(new Set(initialAvailableSlots))
    const [unavailableSlots, setUnavailableSlots] = React.useState<Set<string>>(new Set(initialUnavailableSlots))
    const [isSaving, setIsSaving] = React.useState(false)

    // Update state when props change (e.g. month navigation)
    React.useEffect(() => {
        setAvailableSlots(new Set(initialAvailableSlots))
        setUnavailableSlots(new Set(initialUnavailableSlots))
        setDate(new Date(year, month - 1, 1))
    }, [initialAvailableSlots, initialUnavailableSlots, year, month])

    const handleDayClick = (day: Date) => {
        if (readOnly) return
        setSelectedDate(day)
        setIsDialogOpen(true)
    }

    const toggleSlot = (slotIso: string, type: 'available' | 'unavailable' | 'neutral') => {
        const newAvailable = new Set(availableSlots)
        const newUnavailable = new Set(unavailableSlots)

        if (type === 'available') {
            newAvailable.add(slotIso)
            newUnavailable.delete(slotIso)
        } else if (type === 'unavailable') {
            newUnavailable.add(slotIso)
            newAvailable.delete(slotIso)
        } else {
            newAvailable.delete(slotIso)
            newUnavailable.delete(slotIso)
        }

        setAvailableSlots(newAvailable)
        setUnavailableSlots(newUnavailable)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await onSave(year, month, {
                availableSlots: Array.from(availableSlots),
                unavailableSlots: Array.from(unavailableSlots)
            })
            // Maybe show toast here?
        } finally {
            setIsSaving(false)
        }
    }

    // Generate time slots 9:00 - 22:00
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

    const getSlotStatus = (iso: string) => {
        if (availableSlots.has(iso)) return 'available'
        if (unavailableSlots.has(iso)) return 'unavailable'
        return 'neutral'
    }

    // Custom modifiers for calendar to show dots
    const modifiers = {
        hasAvailable: (date: Date) => {
            return Array.from(availableSlots).some(slot => isSameDay(new Date(slot), date))
        },
        hasUnavailable: (date: Date) => {
            return Array.from(unavailableSlots).some(slot => isSameDay(new Date(slot), date))
        }
    }

    const modifiersStyles = {
        hasAvailable: { fontWeight: 'bold', textDecoration: 'underline decoration-green-500' }, // basic styling
        hasUnavailable: { textDecoration: 'underline decoration-red-500' }
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center px-4">
                <Button variant="outline" size="sm" onClick={() => {
                    const d = subMonths(new Date(year, month - 1), 1)
                    onMonthChange(d.getFullYear(), d.getMonth() + 1)
                }}>
                    <ChevronLeft className="h-4 w-4" />
                    前月
                </Button>
                <div className="text-lg font-bold">
                    {year}年 {month}月
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                    const d = addMonths(new Date(year, month - 1), 1)
                    onMonthChange(d.getFullYear(), d.getMonth() + 1)
                }}>
                    次月
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="border rounded-md p-4 flex justify-center">
                <Calendar
                    mode="single"
                    month={new Date(year, month - 1, 1)}
                    onMonthChange={(d) => onMonthChange(d.getFullYear(), d.getMonth() + 1)}
                    selected={date}
                    onSelect={setDate}
                    onDayClick={handleDayClick}
                    locale={ja}
                    modifiers={modifiers}
                    modifiersClassNames={{
                        hasAvailable: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-green-500 after:rounded-full",
                        hasUnavailable: "before:content-[''] before:absolute before:top-1 before:right-1 before:w-1 before:h-1 before:bg-red-500 before:rounded-full"
                    }}
                    disableNavigation // We handle navigation manually above
                />
            </div>

            {!readOnly && (
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        保存する
                    </Button>
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {selectedDate ? format(selectedDate, "M月d日 (E)", { locale: ja }) : ""} の希望
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-4">
                        <div className="flex flex-wrap gap-2 justify-center">
                            <Button size="sm" variant="outline" onClick={() => {
                                const newAvailable = new Set(availableSlots)
                                const newUnavailable = new Set(unavailableSlots)
                                timeSlots.forEach(slot => {
                                    newAvailable.add(slot)
                                    newUnavailable.delete(slot)
                                })
                                setAvailableSlots(newAvailable)
                                setUnavailableSlots(newUnavailable)
                            }}>全可</Button>
                            <Button size="sm" variant="outline" onClick={() => {
                                const newAvailable = new Set(availableSlots)
                                const newUnavailable = new Set(unavailableSlots)
                                timeSlots.forEach(slot => {
                                    newUnavailable.add(slot)
                                    newAvailable.delete(slot)
                                })
                                setAvailableSlots(newAvailable)
                                setUnavailableSlots(newUnavailable)
                            }}>全不可</Button>
                            <Button size="sm" variant="outline" onClick={() => {
                                const newAvailable = new Set(availableSlots)
                                const newUnavailable = new Set(unavailableSlots)
                                timeSlots.forEach(slot => {
                                    newAvailable.delete(slot)
                                    newUnavailable.delete(slot)
                                })
                                setAvailableSlots(newAvailable)
                                setUnavailableSlots(newUnavailable)
                            }}>クリア</Button>
                            <Button size="sm" variant="secondary" onClick={() => {
                                if (!selectedDate) return
                                const dayOfWeek = selectedDate.getDay()
                                const targetDates = []
                                const start = new Date(year, month - 1, 1)
                                const end = new Date(year, month, 0)

                                for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
                                    if (d.getDay() === dayOfWeek) {
                                        targetDates.push(new Date(d))
                                    }
                                }

                                const newAvailable = new Set(availableSlots)
                                const newUnavailable = new Set(unavailableSlots)

                                // Get current day's selection
                                const currentDaySlots = timeSlots.map(slot => ({
                                    time: format(new Date(slot), "HH:mm"),
                                    status: availableSlots.has(slot) ? 'available' : unavailableSlots.has(slot) ? 'unavailable' : 'neutral'
                                }))

                                targetDates.forEach(targetDate => {
                                    // Provide same slots for target date
                                    const targetBase = startOfDay(targetDate)
                                    currentDaySlots.forEach(({ time, status }) => {
                                        const [h, m] = time.split(':').map(Number)
                                        const targetSlot = setMinutes(setHours(targetBase, h), m).toISOString()

                                        if (status === 'available') {
                                            newAvailable.add(targetSlot)
                                            newUnavailable.delete(targetSlot)
                                        } else if (status === 'unavailable') {
                                            newUnavailable.add(targetSlot)
                                            newAvailable.delete(targetSlot)
                                        } else {
                                            newAvailable.delete(targetSlot)
                                            newUnavailable.delete(targetSlot)
                                        }
                                    })
                                })

                                setAvailableSlots(newAvailable)
                                setUnavailableSlots(newUnavailable)
                                setIsDialogOpen(false) // Close after applying? Or maybe show toast?
                            }}>
                                この曜日すべてに適用
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {timeSlots.map((slotIso) => {
                                const status = getSlotStatus(slotIso)
                                const timeLabel = format(new Date(slotIso), "H:mm")

                                return (
                                    <div
                                        key={slotIso}
                                        className="flex flex-col gap-1"
                                    >
                                        <div className="text-sm text-center font-medium">{timeLabel}</div>
                                        <div className="flex gap-1 justify-center">
                                            <button
                                                onClick={() => toggleSlot(slotIso, 'available')}
                                                className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                                                    status === 'available' ? "bg-green-500 text-white border-green-600" : "bg-white border-gray-200 hover:bg-green-50"
                                                )}
                                                title="行ける"
                                            >
                                                ◯
                                            </button>
                                            <button
                                                onClick={() => toggleSlot(slotIso, 'unavailable')}
                                                className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                                                    status === 'unavailable' ? "bg-red-500 text-white border-red-600" : "bg-white border-gray-200 hover:bg-red-50"
                                                )}
                                                title="ダメ"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setIsDialogOpen(false)}>決定</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
