import { getMonthlyPlanningData } from "@/app/lib/actions/planning"
import { MonthlyScheduler } from "@/components/teacher/MonthlyScheduler"
import { redirect } from "next/navigation"
import { getClosedDaysInRangeSafe } from "@/lib/closed-days"
import { startOfMonth, endOfMonth, addDays } from "date-fns"
import { getTeacherWorkingHoursSafe } from "@/lib/teacher-working-hours"
import { getCachedSession } from "@/lib/session"

export default async function MonthlyPlanningPage({
    searchParams
}: {
    searchParams: Promise<{ year?: string, month?: string }>
}) {
    const params = await searchParams

    const session = await getCachedSession()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const now = new Date()
    // Default to NEXT month for planning? Or current?
    // Usually planning is for next month. Let's default to next month.
    const parsedYear = params.year ? Number.parseInt(params.year, 10) : NaN
    const parsedMonth = params.month ? Number.parseInt(params.month, 10) : NaN
    const year = Number.isFinite(parsedYear) ? parsedYear : now.getFullYear()
    const month = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : now.getMonth() + 1

    // If no params, maybe redirect to next month? 
    // If today is late in the month (e.g. > 20th), suggest next month?
    // For now, simple default.

    const monthStart = startOfMonth(new Date(year, month - 1, 1))
    const monthEndExclusive = addDays(endOfMonth(monthStart), 1)

    const [result, closedDays, workingHours] = await Promise.all([
        getMonthlyPlanningData(year, month),
        getClosedDaysInRangeSafe(monthStart, monthEndExclusive),
        getTeacherWorkingHoursSafe(),
    ])

    if (!result.success || !result.data) {
        return <div>データの取得に失敗しました</div>
    }

    const { students, lessons, supportShifts, isPublished, publishedAt } = result.data

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">月間スケジュール作成</h1>
                <p className="text-slate-500">
                    生徒の希望をもとにレッスンスケジュールを作成します。
                </p>
            </div>

            <MonthlyScheduler
                students={students}
                lessons={lessons}
                supportShifts={supportShifts}
                closedDays={closedDays.map((cd) => ({
                    ...cd,
                    date: new Date(cd.date),
                }))}
                year={year}
                month={month}
                isPublished={isPublished}
                publishedAt={publishedAt}
                workingHours={workingHours}
            />
        </div>
    )
}
