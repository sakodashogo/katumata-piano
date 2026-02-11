"use client"

import { useState } from "react"
import { getMenus, getAvailableSlots, bookLesson, rescheduleLesson } from "@/app/lib/actions/booking"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { Loader2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Menu = {
    id: string
    name: string
    duration: number
    price: number
}

type Slot = {
    id: string
    startTime: Date
    endTime: Date
}

export function BookingWizard({
    menus,
    rescheduleLessonId,
    initialMenuId
}: {
    menus: Menu[],
    rescheduleLessonId?: string,
    initialMenuId?: string
}) {
    const [step, setStep] = useState(initialMenuId ? 2 : 1)
    const [selectedMenu, setSelectedMenu] = useState<Menu | null>(
        initialMenuId ? menus.find(m => m.id === initialMenuId) || null : null
    )
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
    const [availableSlots, setAvailableSlots] = useState<Slot[]>([])
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
    const [loading, setLoading] = useState(false)
    const [bookingSuccess, setBookingSuccess] = useState(false)

    // Fetch slots when date changes
    const handleDateSelect = async (date: Date | undefined) => {
        setSelectedDate(date)
        setSelectedSlot(null)
        if (date) {
            setLoading(true)
            const res = await getAvailableSlots(date.toISOString())
            if (res.success) {
                setAvailableSlots(res.data as any)
            }
            setLoading(false)
        }
    }

    const handleBooking = async () => {
        if (!selectedSlot || !selectedMenu) return
        setLoading(true)

        let res;
        if (rescheduleLessonId) {
            res = await rescheduleLesson(rescheduleLessonId, [selectedSlot.id])
        } else {
            res = await bookLesson([selectedSlot.id], selectedMenu.id)
        }

        if (res.success) {
            setBookingSuccess(true)
        } else {
            alert("Booking failed: " + res.error)
        }
        setLoading(false)
    }

    if (bookingSuccess) {
        return (
            <Card className="text-center py-10">
                <CardContent className="flex flex-col items-center gap-4">
                    <CheckCircle2 className="h-16 w-16 text-green-500" />
                    <h3 className="text-2xl font-bold">{rescheduleLessonId ? "Reschedule Confirmed!" : "Booking Confirmed!"}</h3>
                    <p className="text-slate-500">
                        Your {selectedMenu?.name} is scheduled for {format(selectedSlot!.startTime, "MMMM d, h:mm a")}.
                    </p>
                    <Button onClick={() => window.location.href = "/student"}>Go to Dashboard</Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            {/* Progress */}
            <div className="flex justify-between items-center text-sm font-medium text-slate-400">
                <span className={cn(step >= 1 && "text-blue-600")}>1. Select Menu</span>
                <span className="h-px bg-slate-200 flex-1 mx-4" />
                <span className={cn(step >= 2 && "text-blue-600")}>2. Choose Time</span>
                <span className="h-px bg-slate-200 flex-1 mx-4" />
                <span className={cn(step >= 3 && "text-blue-600")}>3. Confirm</span>
            </div>

            {step === 1 && (
                <div className="grid gap-4">
                    <h2 className="text-xl font-bold">Choose a Lesson Type</h2>
                    {menus.map((menu) => (
                        <Card
                            key={menu.id}
                            className={cn("cursor-pointer transition-all hover:border-blue-500", selectedMenu?.id === menu.id && "border-blue-500 ring-1 ring-blue-500")}
                            onClick={() => setSelectedMenu(menu)}
                        >
                            <CardHeader>
                                <CardTitle className="flex justify-between">
                                    <span>{menu.name}</span>
                                    <span>¥{menu.price.toLocaleString()}</span>
                                </CardTitle>
                                <CardDescription>{menu.duration} minutes</CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                    <div className="flex justify-end mt-4">
                        <Button disabled={!selectedMenu} onClick={() => setStep(2)}>Next</Button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                    <h2 className="text-xl font-bold">Select Date & Time</h2>
                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={handleDateSelect}
                                className="rounded-md border shadow"
                                disabled={(date) => date < new Date() || date > new Date(new Date().setMonth(new Date().getMonth() + 2))}
                            />
                        </div>
                        <div>
                            <h3 className="font-medium mb-4">Available Slots</h3>
                            {loading ? (
                                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
                            ) : availableSlots.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                    {availableSlots.map((slot) => (
                                        <Button
                                            key={slot.id}
                                            variant={selectedSlot?.id === slot.id ? "primary" : "outline"}
                                            onClick={() => setSelectedSlot(slot)}
                                            className="w-full"
                                        >
                                            {format(new Date(slot.startTime), "h:mm a")}
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">No slots available for this date.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between mt-4">
                        <Button variant="ghost" onClick={() => setStep(1)} disabled={!!initialMenuId}>Back</Button>
                        <Button disabled={!selectedSlot} onClick={() => setStep(3)}>Next</Button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Confirm Booking</CardTitle>
                        <CardDescription>Please review your booking details.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-slate-500">Lesson Type</span>
                            <span className="font-medium">{selectedMenu?.name}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-slate-500">Date</span>
                            <span className="font-medium">{selectedDate && format(selectedDate, "MMMM d, yyyy")}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-slate-500">Time</span>
                            <span className="font-medium">{selectedSlot && format(selectedSlot.startTime, "h:mm a")}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-slate-500">Price</span>
                            <span className="font-medium">¥{selectedMenu?.price.toLocaleString()}</span>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                        <Button onClick={handleBooking} disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Confirm Booking
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    )
}
