import { auth } from "@/auth"
import { getMonthlyPlanningData } from "@/app/lib/actions/planning"
import { MonthlyScheduler } from "@/components/teacher/MonthlyScheduler"
import { redirect } from "next/navigation"

export default async function MonthlyPlanningPage({
    searchParams
}: {
    searchParams: { year?: string, month?: string }
}) {
    // Await searchParams
    const params = await Promise.resolve(searchParams)

    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const now = new Date()
    // Default to NEXT month for planning? Or current?
    // Usually planning is for next month. Let's default to next month.
    const year = params.year ? parseInt(params.year) : now.getFullYear()
    const month = params.month ? parseInt(params.month) : now.getMonth() + 1

    // If no params, maybe redirect to next month? 
    // If today is late in the month (e.g. > 20th), suggest next month?
    // For now, simple default.

    const result = await getMonthlyPlanningData(year, month)

    if (!result.success || !result.data) {
        return <div>データの取得に失敗しました</div>
    }

    const { students, lessons } = result.data

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
                year={year}
                month={month}
            />
        </div>
    )
}
