import { auth } from "@/auth"
import { getClosedDaysForMonth } from "@/app/lib/actions/closed-day"
import { ClosedDayManager } from "@/components/teacher/ClosedDayManager"
import { redirect } from "next/navigation"

export default async function ClosedDaysPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const params = await searchParams
    const yearParamRaw = params.year
    const monthParamRaw = params.month
    const yearParam = Number(Array.isArray(yearParamRaw) ? yearParamRaw[0] : yearParamRaw)
    const monthParam = Number(Array.isArray(monthParamRaw) ? monthParamRaw[0] : monthParamRaw)

    const now = new Date()
    const currentYear = Number.isFinite(yearParam) && yearParam >= 2000 ? yearParam : now.getFullYear()
    const currentMonth = Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
        ? monthParam
        : now.getMonth() + 1

    const result = await getClosedDaysForMonth(currentYear, currentMonth)
    const closedDays = result.success ? (result.data ?? []) : []

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">お休み設定</h1>
                <p className="text-slate-500">教室のお休み（休業日・時間帯休止）を管理します。</p>
            </div>

            <ClosedDayManager
                initialYear={currentYear}
                initialMonth={currentMonth}
                closedDays={closedDays.map((day) => ({
                    ...day,
                    date: new Date(day.date),
                }))}
            />
        </div>
    )
}
