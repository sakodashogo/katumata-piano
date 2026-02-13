import { auth } from "@/auth"
import { getSupportShiftsInRange, getSupportStaff } from "@/app/lib/actions/support"
import { SupportShiftPlanner } from "@/components/teacher/SupportShiftPlanner"
import { addDays, endOfMonth, startOfMonth } from "date-fns"
import { redirect } from "next/navigation"
import { getClosedDaysInRangeSafe } from "@/lib/closed-days"
import { getTeacherWorkingHoursSafe } from "@/lib/teacher-working-hours"

type ShiftRow = {
    id: string
    staffId: string
    startTime: Date | string
    endTime: Date | string
    staff?: { id: string; name: string; active: boolean } | null
}

export default async function SupportPage({
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

    const dateParamRaw = params.date
    const dateParam = Array.isArray(dateParamRaw) ? dateParamRaw[0] : dateParamRaw
    const parsedDate = dateParam ? new Date(dateParam) : new Date()
    const fallbackDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate

    const currentYear = Number.isFinite(yearParam) && yearParam >= 2000 ? yearParam : fallbackDate.getFullYear()
    const currentMonth = Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
        ? monthParam
        : fallbackDate.getMonth() + 1

    const monthStart = startOfMonth(new Date(currentYear, currentMonth - 1, 1))
    const monthEndExclusive = addDays(endOfMonth(monthStart), 1)

    const [staffRes, shiftsRes, closedDays, workingHours] = await Promise.all([
        getSupportStaff(),
        getSupportShiftsInRange(monthStart.toISOString(), monthEndExclusive.toISOString()),
        getClosedDaysInRangeSafe(monthStart, monthEndExclusive),
        getTeacherWorkingHoursSafe(),
    ])

    const staff = staffRes.success ? (staffRes.data ?? []) : []
    const shifts = shiftsRes.success ? ((shiftsRes.data ?? []) as ShiftRow[]) : []

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">サポート講師シフト</h1>
                <p className="text-slate-500">講師登録と月次シフト提出をカレンダーで管理します。</p>
            </div>

            <SupportShiftPlanner
                initialYear={currentYear}
                initialMonth={currentMonth}
                staff={staff}
                shifts={shifts.map((shift) => ({
                    ...shift,
                    startTime: new Date(shift.startTime),
                    endTime: new Date(shift.endTime),
                }))}
                closedDays={closedDays.map((cd) => ({
                    ...cd,
                    date: new Date(cd.date),
                }))}
                workingHours={workingHours}
            />
        </div>
    )
}
