"use client"

import { useMemo, useState } from "react"
import { format, isSameDay } from "date-fns"
import { ja } from "date-fns/locale"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LESSON_STATUS_LABELS, LESSON_STATUS_STYLES, LESSON_TYPE_LABELS } from "@/lib/constants"
import { LessonActions } from "@/components/student/LessonActions"

type LessonItem = {
    id: string
    startTime: string
    endTime: string
    type: string
    status: string
    menuId: string | null
}

function isAdditional(type: string) {
    return type === "AD_HOC" || type === "PRACTICE" || type === "SOLO_ADDITIONAL" || type === "DUET_ADDITIONAL"
}

export function StudentScheduleCalendar({ lessons }: { lessons: LessonItem[] }) {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())

    const selectedDayLessons = useMemo(
        () =>
            lessons.filter((lesson) =>
                isSameDay(new Date(lesson.startTime), selectedDate)
            ),
        [lessons, selectedDate]
    )

    const regularLessons = selectedDayLessons.filter((lesson) => lesson.type === "REGULAR")
    const additionalLessons = selectedDayLessons.filter((lesson) => isAdditional(lesson.type))

    return (
        <Card>
            <CardHeader>
                <CardTitle>予約カレンダー</CardTitle>
                <p className="text-xs text-slate-500">日時変更・キャンセルは各レッスンカード下のボタンから操作できます。</p>
                <div className="flex gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        固定レッスン
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        自主練・ソロ・連弾
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        振替待ち
                    </span>
                </div>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[360px_1fr]">
                <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    modifiers={{
                        hasRegular: (date) =>
                            lessons.some(
                                (lesson) =>
                                    lesson.type === "REGULAR" &&
                                    isSameDay(new Date(lesson.startTime), date)
                            ),
                        hasAdditional: (date) =>
                            lessons.some(
                                (lesson) =>
                                    isAdditional(lesson.type) &&
                                    isSameDay(new Date(lesson.startTime), date)
                            ),
                    }}
                    modifiersClassNames={{
                        hasRegular: "relative after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-1.5 after:h-1.5 after:w-1.5 after:rounded-full after:bg-blue-500",
                        hasAdditional: "relative before:absolute before:left-1/2 before:-translate-x-1/2 before:bottom-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-amber-500",
                    }}
                    className="rounded-md border"
                />

                <div className="space-y-5">
                    <div className="text-sm font-semibold text-slate-700">
                        {format(selectedDate, "yyyy年M月d日 (E)", { locale: ja })}
                    </div>

                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-blue-700">固定レッスン</h3>
                        {regularLessons.length === 0 ? (
                            <p className="text-sm text-slate-500">この日の固定レッスンはありません。</p>
                        ) : (
                            regularLessons.map((lesson) => (
                                <div key={lesson.id} className="rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="font-medium text-slate-800">
                                            {format(new Date(lesson.startTime), "HH:mm")} - {format(new Date(lesson.endTime), "HH:mm")}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                                {LESSON_TYPE_LABELS[lesson.type] || lesson.type}
                                            </span>
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LESSON_STATUS_STYLES[lesson.status] || "bg-slate-100 text-slate-600"}`}>
                                                {LESSON_STATUS_LABELS[lesson.status] || lesson.status}
                                            </span>
                                        </div>
                                    </div>
                                    <LessonActions lessonId={lesson.id} menuId={lesson.menuId || undefined} startTime={lesson.startTime} />
                                </div>
                            ))
                        )}
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-amber-700">追加予約</h3>
                        {additionalLessons.length === 0 ? (
                            <p className="text-sm text-slate-500">この日の追加予約はありません。</p>
                        ) : (
                            additionalLessons.map((lesson) => (
                                <div key={lesson.id} className="rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="font-medium text-slate-800">
                                            {format(new Date(lesson.startTime), "HH:mm")} - {format(new Date(lesson.endTime), "HH:mm")}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                                {LESSON_TYPE_LABELS[lesson.type] || lesson.type}
                                            </span>
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LESSON_STATUS_STYLES[lesson.status] || "bg-slate-100 text-slate-600"}`}>
                                                {LESSON_STATUS_LABELS[lesson.status] || lesson.status}
                                            </span>
                                        </div>
                                    </div>
                                    <LessonActions lessonId={lesson.id} menuId={lesson.menuId || undefined} startTime={lesson.startTime} />
                                </div>
                            ))
                        )}
                    </section>
                </div>
            </CardContent>
        </Card>
    )
}
