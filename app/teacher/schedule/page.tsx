import { getScheduleData } from "@/app/lib/actions/schedule"
import { AdminCalendar } from "@/components/teacher/AdminCalendar"
import { endOfWeek, startOfWeek } from "date-fns"
import { SyncButton } from "@/components/teacher/SyncButton"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getClosedDaysInRangeSafe } from "@/lib/closed-days"
import { getTeacherWorkingHoursSafe } from "@/lib/teacher-working-hours"
import { Suspense } from "react"
import MonthlyPanel from "./_monthly-panel"
import { getCachedSession } from "@/lib/session"

type ScheduleSlot = {
    id: string
    roomId: string
    startTime: Date | string
    endTime: Date | string
    isBooked: boolean
    isPublic: boolean
}

type ScheduleLesson = {
    id: string
    roomId: string | null
    startTime: Date | string
    endTime: Date | string
    type: string
    status: string
    student: { name: string | null }
}

type SupportShift = {
    id: string
    startTime: Date | string
    endTime: Date | string
}

export default async function SchedulePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await getCachedSession()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const params = await searchParams
    const dateStr = (params.date as string) || new Date().toISOString().split("T")[0]
    const parsedDate = new Date(dateStr)
    const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate

    const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday start
    const end = endOfWeek(date, { weekStartsOn: 1 })

    const monthYear = date.getFullYear()
    const month = date.getMonth() + 1
    const [scheduleResult, closedDays, workingHours] = await Promise.all([
        getScheduleData(undefined, start, end),
        getClosedDaysInRangeSafe(start, end),
        getTeacherWorkingHoursSafe(),
    ])

    if (!scheduleResult.success || !scheduleResult.data) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                スケジュールデータの取得に失敗しました。時間をおいて再度お試しください。
            </div>
        )
    }

    const rawSlots = scheduleResult.data.slots as ScheduleSlot[]
    const rawLessons = scheduleResult.data.lessons as ScheduleLesson[]
    const rawSupportShifts = (scheduleResult.data.supportShifts || []) as SupportShift[]

    const slots = rawSlots.map((s) => ({
        ...s,
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime)
    }))

    const lessons = rawLessons.map((l) => ({
        ...l,
        startTime: new Date(l.startTime),
        endTime: new Date(l.endTime)
    }))
    const supportShifts = rawSupportShifts.map((shift) => ({
        ...shift,
        startTime: new Date(shift.startTime),
        endTime: new Date(shift.endTime),
    }))

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">週次スケジュール</h1>
                    <p className="text-slate-500">運用編集（移動・下書き調整）を行います。</p>
                </div>
                <div className="flex gap-2">
                    <SyncButton currentDate={date} roomId="A" />
                    <SyncButton currentDate={date} roomId="B" />
                </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p className="font-semibold">この画面で保存した空き枠変更は運用下書きとして扱います。</p>
                <p className="mt-1">
                    生徒への公開は
                    {" "}
                    <Link href="/teacher/slots" prefetch={false} className="font-bold underline underline-offset-2">
                        空き枠承認画面
                    </Link>
                    {" "}
                    で実行してください。
                </p>
            </div>

            <AdminCalendar
                initialDate={date}
                slots={slots}
                lessons={lessons}
                supportShifts={supportShifts}
                closedDays={closedDays.map((cd) => ({
                    ...cd,
                    date: new Date(cd.date),
                }))}
                workingHours={workingHours}
            />

            <Suspense
                fallback={(
                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 rounded-lg border bg-white px-3 py-2 text-sm text-slate-600">
                            <div className="font-semibold text-slate-800">月間カレンダー（下書き含む）</div>
                            <div className="mt-1 text-xs">月間データを読み込み中です。</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                            読み込み中...
                        </div>
                    </section>
                )}
            >
                <MonthlyPanel year={monthYear} month={month} />
            </Suspense>
        </div>
    )
}
