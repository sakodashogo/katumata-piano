"use client"

import { useState, useEffect } from "react"
import { getAvailableSlots, bookLesson, rescheduleLesson } from "@/app/lib/actions/booking"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter
} from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { format, isSameDay, addMonths } from "date-fns"
import { ja } from "date-fns/locale"
import {
    Loader2,
    CheckCircle2,
    Ticket,
    Clock,
    ChevronRight,
    ArrowLeft,
    Sparkles,
    CalendarCheck,
    Music
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { motion, AnimatePresence } from "framer-motion"

type Menu = {
    id: string
    name: string
    durationMin: number
    price: number
    description: string | null
}

type Slot = {
    id: string
    startTime: Date
    endTime: Date
    roomId: string
}

export function BookingWizard({
    menus,
    rescheduleLessonId,
    initialMenuId,
    credits
}: {
    menus: Menu[],
    rescheduleLessonId?: string,
    initialMenuId?: string,
    credits?: { count: number, used: number, remaining: number } | null
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [step, setStep] = useState(initialMenuId ? 2 : 1)
    const [selectedMenu, setSelectedMenu] = useState<Menu | null>(
        initialMenuId ? menus.find(m => m.id === initialMenuId) || null : null
    )
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
    const [availableSlots, setAvailableSlots] = useState<Slot[]>([])
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
    const [loading, setLoading] = useState(false)
    const [bookingSuccess, setBookingSuccess] = useState(false)
    const [useTicket, setUseTicket] = useState(false)

    // Fetch slots when date or menu changes
    useEffect(() => {
        if (selectedDate && selectedMenu) {
            handleDateSelect(selectedDate)
        }
    }, [selectedDate, selectedMenu])

    const handleDateSelect = async (date: Date | undefined) => {
        setSelectedDate(date)
        setSelectedSlot(null)
        if (date) {
            setLoading(true)
            const res = await getAvailableSlots(date.toISOString())
            if (res.success) {
                // Filter slots that can accommodate the menu duration?
                // Currently assuming slots are 30 mins and menus match.
                // In a more complex system, we'd find contiguous blocks.
                setAvailableSlots(res.data as any)
            }
            setLoading(false)
        }
    }

    const handleBooking = async () => {
        if (!selectedSlot || !selectedMenu) return
        setLoading(true)

        let res: { success: boolean; error?: string };
        if (rescheduleLessonId) {
            res = await rescheduleLesson(rescheduleLessonId, [selectedSlot.id])
        } else {
            res = await bookLesson([selectedSlot.id], selectedMenu.id, useTicket)
        }

        if (res.success) {
            setBookingSuccess(true)
        } else {
            toast.error("予約に失敗しました: " + (res.error || ""))
        }
        setLoading(false)
    }

    if (bookingSuccess) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-xl mx-auto"
            >
                <Card className="text-center py-12 border-none shadow-2xl bg-white rounded-[2.5rem]">
                    <CardContent className="flex flex-col items-center gap-6">
                        <div className="bg-green-100 p-4 rounded-full ring-8 ring-green-50">
                            <CheckCircle2 className="h-16 w-16 text-green-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                                {rescheduleLessonId ? "変更完了！" : "予約完了！"}
                            </h3>
                            <p className="text-slate-500 font-medium">レッスンを楽しみにお待ちしております。</p>
                        </div>

                        <div className="w-full bg-slate-50 rounded-3xl p-6 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400 font-bold">MENU</span>
                                <span className="text-slate-900 font-black">{selectedMenu?.name}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400 font-bold">DATE</span>
                                <span className="text-slate-900 font-black">
                                    {format(new Date(selectedSlot!.startTime), "yyyy年M月d日 (E)", { locale: ja })}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400 font-bold">TIME</span>
                                <span className="text-slate-900 font-black">
                                    {format(new Date(selectedSlot!.startTime), "HH:mm")} - {format(new Date(selectedSlot!.endTime), "HH:mm")}
                                </span>
                            </div>
                        </div>

                        <Button
                            onClick={() => router.push("/student")}
                            className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-lg font-black shadow-xl"
                        >
                            ダッシュボードに戻る
                        </Button>
                    </CardContent>
                </Card>
            </motion.div>
        )
    }

    const stepVariants = {
        hidden: { opacity: 0, x: 50 },
        visible: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -50 }
    }

    return (
        <div className="max-w-4xl mx-auto px-4 pb-20">
            {/* Multi-step Header */}
            <div className="mb-12 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {step > 1 && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-10 w-10 bg-white shadow-sm border"
                            onClick={() => setStep(prev => prev - 1)}
                            disabled={!!initialMenuId && step === 2}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                            {rescheduleLessonId ? "予約の日時を変更" : "レッスンを予約する"}
                        </h1>
                        <p className="text-slate-500 font-medium font-mono text-xs uppercase tracking-widest mt-1">
                            Step {step} of 3
                        </p>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-2">
                    {[1, 2, 3].map(s => (
                        <div
                            key={s}
                            className={cn(
                                "h-2 w-12 rounded-full transition-all duration-500",
                                step === s ? "bg-blue-600 w-24" : step > s ? "bg-blue-200" : "bg-slate-100"
                            )}
                        />
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                {step === 1 && (
                    <motion.div
                        key="step1"
                        variants={stepVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="grid gap-8"
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-2 border border-blue-100 text-blue-700 font-bold text-sm">
                                <Music className="h-4 w-4" />
                                レッスンメニューを選択してください
                            </div>
                            {credits && credits.remaining > 0 && !rescheduleLessonId && (
                                <div className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2 border border-amber-100 text-amber-700 font-bold text-sm shadow-sm ring-4 ring-amber-50/50">
                                    <Ticket className="h-4 w-4" />
                                    <span>振替チケット残: {credits.remaining}枚</span>
                                </div>
                            )}
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {menus.map((menu) => (
                                <motion.div
                                    key={menu.id}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <Card
                                        className={cn(
                                            "relative cursor-pointer h-full transition-all duration-300 border-2 rounded-[2rem] overflow-hidden group",
                                            selectedMenu?.id === menu.id
                                                ? "border-blue-600 bg-blue-50/30 ring-4 ring-blue-50"
                                                : "border-slate-100 bg-white hover:border-blue-200 shadow-sm hover:shadow-xl"
                                        )}
                                        onClick={() => setSelectedMenu(menu)}
                                    >
                                        <CardHeader className="pb-2">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className={cn(
                                                    "p-3 rounded-2xl transition-colors",
                                                    selectedMenu?.id === menu.id ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600"
                                                )}>
                                                    <Sparkles className="h-5 w-5" />
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-2xl font-black text-slate-900">
                                                        ¥{menu.price.toLocaleString()}
                                                    </span>
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Price</div>
                                                </div>
                                            </div>
                                            <CardTitle className="text-xl font-black text-slate-800 tracking-tight">{menu.name}</CardTitle>
                                            <CardDescription className="font-medium text-slate-500 flex items-center gap-1.5 mt-1">
                                                <Clock className="h-3.5 w-3.5" />
                                                受講時間: {menu.durationMin}分
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-slate-500 line-clamp-2 min-h-[2.5rem] leading-relaxed">
                                                {menu.description || "お気軽にお申し込みください。"}
                                            </p>
                                        </CardContent>
                                        <div className={cn(
                                            "absolute bottom-4 right-6 transition-opacity",
                                            selectedMenu?.id === menu.id ? "opacity-100" : "opacity-0"
                                        )}>
                                            <div className="bg-blue-600 rounded-full p-1.5 text-white">
                                                <CheckCircle2 className="h-4 w-4" />
                                            </div>
                                        </div>
                                    </Card>
                                </motion.div>
                            ))}
                        </div>

                        <div className="flex justify-center pt-4">
                            <Button
                                disabled={!selectedMenu}
                                onClick={() => setStep(2)}
                                className="w-full md:w-80 h-16 rounded-[1.5rem] bg-blue-600 hover:bg-blue-700 text-white font-black text-xl shadow-2xl shadow-blue-500/20 group"
                            >
                                次へ
                                <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                    </motion.div>
                )}

                {step === 2 && (
                    <motion.div
                        key="step2"
                        variants={stepVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="space-y-8"
                    >
                        <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl shadow-slate-200/50 border border-slate-100">
                            <div className="grid lg:grid-cols-[1fr_350px] gap-12">
                                <div className="space-y-6">
                                    <div className="inline-flex items-center gap-2 rounded-2xl bg-indigo-50 px-4 py-2 border border-indigo-100 text-indigo-700 font-bold text-sm mb-2">
                                        <CalendarCheck className="h-4 w-4" />
                                        ご希望の日付を選択してください
                                    </div>
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={handleDateSelect}
                                        locale={ja}
                                        className="rounded-3xl border-none shadow-none p-0 student-booking-calendar w-full"
                                        disabled={(date) => date < new Date() || date > addMonths(new Date(), 2)}
                                    />
                                    <style jsx global>{`
                                        .student-booking-calendar .rdp {
                                            --rdp-cell-size: 3.5rem;
                                            --rdp-accent-color: #2563eb;
                                            --rdp-background-alpha: 0.1;
                                            margin: 0;
                                        }
                                        .student-booking-calendar .rdp-day_selected {
                                            background-color: var(--rdp-accent-color);
                                            color: white;
                                            font-weight: 900;
                                            border-radius: 1rem;
                                        }
                                        .student-booking-calendar .rdp-day {
                                            border-radius: 1rem;
                                            font-weight: 700;
                                        }
                                        .student-booking-calendar .rdp-button:hover:not(.rdp-day_selected) {
                                            background-color: #f1f5f9;
                                            color: #1e293b;
                                        }
                                    `}</style>
                                </div>

                                <div className="space-y-6 border-l lg:pl-12 border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-black text-slate-900 tracking-tight flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-blue-600" />
                                            予約可能な時間枠
                                        </h3>
                                        {selectedDate && (
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                {format(selectedDate, "M/d")}
                                            </span>
                                        )}
                                    </div>

                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <Loader2 className="animate-spin text-blue-500 h-10 w-10 opacity-30" />
                                            <p className="text-slate-400 font-bold text-sm">空き時間を検索中...</p>
                                        </div>
                                    ) : availableSlots.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                            {availableSlots.map((slot) => (
                                                <motion.button
                                                    key={slot.id}
                                                    whileHover={{ y: -2 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => setSelectedSlot(slot)}
                                                    className={cn(
                                                        "h-14 rounded-2xl border-2 font-black transition-all flex flex-col items-center justify-center relative",
                                                        selectedSlot?.id === slot.id
                                                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                                                            : "border-slate-100 bg-white hover:border-blue-200 text-slate-700"
                                                    )}
                                                >
                                                    <span className="text-base leading-none mb-0.5">
                                                        {format(new Date(slot.startTime), "HH:mm")}
                                                    </span>
                                                    <span className={cn(
                                                        "text-[9px] uppercase tracking-tighter opacity-70",
                                                        selectedSlot?.id === slot.id ? "text-blue-100" : "text-slate-400"
                                                    )}>
                                                        Room {slot.roomId}
                                                    </span>
                                                </motion.button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 rounded-3xl p-8 text-center space-y-3">
                                            <CheckCircle2 className="h-8 w-8 text-slate-200 mx-auto" />
                                            <p className="text-slate-400 font-bold text-sm leading-relaxed">
                                                申し訳ございません。<br />この日の空き枠はありません。
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-center pt-4">
                            <Button
                                disabled={!selectedSlot}
                                onClick={() => setStep(3)}
                                className="w-full md:w-80 h-16 rounded-[1.5rem] bg-slate-900 hover:bg-slate-800 text-white font-black text-xl shadow-2xl group"
                            >
                                予約内容の確認
                                <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                    </motion.div>
                )}

                {step === 3 && (
                    <motion.div
                        key="step3"
                        variants={stepVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="max-w-2xl mx-auto"
                    >
                        <Card className="border-none shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] rounded-[3rem] overflow-hidden bg-white">
                            <div className="bg-slate-900 px-10 py-10 text-white">
                                <h2 className="text-3xl font-black tracking-tight mb-2">最終確認</h2>
                                <p className="text-slate-400 font-medium">予約内容をご確認の上、確定ボタンを押してください。</p>
                            </div>

                            <CardContent className="px-10 py-10 space-y-8">
                                <div className="space-y-6">
                                    <div className="flex items-start gap-5">
                                        <div className="bg-slate-50 p-4 rounded-3xl text-slate-400 group-hover:bg-blue-50 transition-colors">
                                            <Sparkles className="h-6 w-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Lesson Menu</div>
                                            <div className="text-xl font-black text-slate-900">{selectedMenu?.name}</div>
                                            <div className="text-sm text-slate-500 font-medium">{selectedMenu?.durationMin}分のレッスン</div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-slate-100 flex-1" />

                                    <div className="flex items-start gap-5">
                                        <div className="bg-slate-50 p-4 rounded-3xl text-slate-400">
                                            <Clock className="h-6 w-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1">Schedule</div>
                                            <div className="text-xl font-black text-slate-900">
                                                {selectedDate && format(selectedDate, "yyyy年M月d日 (E)", { locale: ja })}
                                            </div>
                                            <div className="text-lg font-black text-blue-600 mt-0.5">
                                                {selectedSlot && format(new Date(selectedSlot.startTime), "HH:mm")} 〜 {selectedSlot && format(new Date(selectedSlot.endTime), "HH:mm")}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Special Options */}
                                <div className="space-y-4 pt-4">
                                    {!rescheduleLessonId && credits && credits.remaining > 0 && (
                                        <div className={cn(
                                            "flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all",
                                            useTicket ? "bg-amber-50 border-amber-500 ring-8 ring-amber-50 shadow-lg" : "bg-slate-50 border-transparent shadow-inner"
                                        )}>
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "p-3 rounded-2xl",
                                                    useTicket ? "bg-amber-500 text-white" : "bg-white text-slate-300 shadow-sm"
                                                )}>
                                                    <Ticket className="h-5 w-5" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <Label htmlFor="ticket-mode" className="text-base font-black text-slate-800 cursor-pointer">
                                                        振替チケットを適用する
                                                    </Label>
                                                    <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                                        残り: {credits.remaining}枚
                                                    </div>
                                                </div>
                                            </div>
                                            <Switch
                                                id="ticket-mode"
                                                checked={useTicket}
                                                onCheckedChange={setUseTicket}
                                                className="data-[state=checked]:bg-amber-500"
                                            />
                                        </div>
                                    )}

                                    {rescheduleLessonId && (
                                        <div className="bg-indigo-50 p-6 rounded-[2rem] border-2 border-indigo-100 text-indigo-700 space-y-2 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                                <CalendarCheck className="h-16 w-16" />
                                            </div>
                                            <h4 className="font-black flex items-center gap-2">日程変更（振替）について</h4>
                                            <p className="text-sm font-bold opacity-80 leading-relaxed">
                                                完了すると、振替権利を1回分消費して新しい日時に変更します。
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Price Breakdown */}
                                <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white space-y-4">
                                    <div className="flex justify-between items-center opacity-60">
                                        <span className="text-sm font-bold">小計</span>
                                        <span className="font-mono">¥{selectedMenu?.price.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold opacity-60">チケット割引</span>
                                        <span className="font-mono text-amber-400">-{useTicket ? `¥${selectedMenu?.price.toLocaleString()}` : "¥0"}</span>
                                    </div>
                                    <div className="h-px bg-white/10 my-2" />
                                    <div className="flex justify-between items-end">
                                        <span className="text-lg font-black uppercase tracking-widest">Total</span>
                                        <span className="text-4xl font-black text-blue-400 flex items-baseline gap-1">
                                            <span className="text-sm font-bold">¥</span>
                                            {useTicket ? "0" : selectedMenu?.price.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>

                            <CardFooter className="px-10 pb-10 gap-4">
                                <Button
                                    onClick={handleBooking}
                                    disabled={loading}
                                    className="w-full h-20 rounded-[1.5rem] bg-blue-600 hover:bg-blue-700 text-white font-black text-2xl shadow-2xl shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-95"
                                >
                                    {loading ? <Loader2 className="mr-3 h-8 w-8 animate-spin" /> : null}
                                    予約する
                                </Button>
                            </CardFooter>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
