import { getMonthlyLessonCalendarData } from "@/app/lib/actions/schedule"
import { MonthlyAllStudentsCalendar } from "@/components/teacher/MonthlyAllStudentsCalendar"
import { getClosedDaysInRangeSafe } from "@/lib/closed-days"
import { addDays, endOfMonth, startOfMonth } from "date-fns"

type MonthlyLesson = {
    id: string
    studentId: string
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

export default async function MonthlyPanel({
    year,
    month,
}: {
    year: number
    month: number
}) {
    const monthStart = startOfMonth(new Date(year, month - 1, 1))
    const monthEndExclusive = addDays(endOfMonth(monthStart), 1)

    const [monthlyCalendarResult, monthClosedDays] = await Promise.all([
        getMonthlyLessonCalendarData(year, month),
        getClosedDaysInRangeSafe(monthStart, monthEndExclusive),
    ])

    const monthlyLessons = monthlyCalendarResult.success && monthlyCalendarResult.data
        ? (monthlyCalendarResult.data.lessons as MonthlyLesson[]).map((lesson) => ({
            id: lesson.id,
            studentId: lesson.studentId,
            studentName: lesson.student?.name || "名前未設定",
            startTime: new Date(lesson.startTime),
            endTime: new Date(lesson.endTime),
            roomId: lesson.roomId,
            type: lesson.type,
            status: lesson.status,
        }))
        : []

    const monthlySupportShifts = monthlyCalendarResult.success && monthlyCalendarResult.data
        ? ((monthlyCalendarResult.data.supportShifts || []) as SupportShift[]).map((shift) => ({
            ...shift,
            startTime: new Date(shift.startTime),
            endTime: new Date(shift.endTime),
        }))
        : []

    return (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 rounded-lg border bg-white px-3 py-2 text-sm text-slate-600">
                <div className="font-semibold text-slate-800">月間カレンダー（下書き含む）</div>
                <div className="mt-1 text-xs">
                    月間スケジュールで保存した下書きもこのタブで確認できます。
                </div>
            </div>
            {monthlyCalendarResult.success ? (
                <MonthlyAllStudentsCalendar
                    lessons={monthlyLessons}
                    supportShifts={monthlySupportShifts}
                    closedDays={monthClosedDays.map((cd) => ({
                        ...cd,
                        date: new Date(cd.date),
                    }))}
                    year={year}
                    month={month}
                />
            ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    月間カレンダーの読み込みに失敗しました。
                </div>
            )}
        </section>
    )
}
