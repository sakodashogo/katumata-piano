import { auth } from "@/auth"
import { getSupportShiftsInRange, getSupportStaff } from "@/app/lib/actions/support"
import { SupportShiftPlanner } from "@/components/teacher/SupportShiftPlanner"
import { endOfWeek, startOfWeek } from "date-fns"
import { redirect } from "next/navigation"

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
    const dateParamRaw = params.date
    const dateParam = Array.isArray(dateParamRaw) ? dateParamRaw[0] : dateParamRaw
    const parsed = dateParam ? new Date(dateParam) : new Date()
    const baseDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed
    const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })

    const [staffRes, shiftsRes] = await Promise.all([
        getSupportStaff(),
        getSupportShiftsInRange(weekStart.toISOString(), weekEnd.toISOString()),
    ])

    const staff = staffRes.success ? (staffRes.data ?? []) : []
    const shifts = shiftsRes.success ? ((shiftsRes.data ?? []) as ShiftRow[]) : []

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">サポート講師シフト</h1>
                <p className="text-slate-500">講師登録と週次シフトをカレンダーで管理します。</p>
            </div>

            <SupportShiftPlanner
                initialDate={baseDate}
                staff={staff}
                shifts={shifts.map((shift) => ({
                    ...shift,
                    startTime: new Date(shift.startTime),
                    endTime: new Date(shift.endTime),
                }))}
            />
        </div>
    )
}
