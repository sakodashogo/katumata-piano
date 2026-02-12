import { getScheduleData } from "@/app/lib/actions/schedule"
import { AdminCalendar } from "@/components/teacher/AdminCalendar"
import { startOfWeek, endOfWeek } from "date-fns"
import { getStudents } from "@/app/lib/actions/student"
import { SyncButton } from "@/components/teacher/SyncButton"

export default async function SchedulePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const room = (params.room as string) || "A"
    const dateStr = (params.date as string) || new Date().toISOString().split("T")[0]
    const date = new Date(dateStr)

    const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday start
    const end = endOfWeek(date, { weekStartsOn: 1 })

    const { data } = await getScheduleData(undefined, start, end)

    // Explicitly cast or validate to match AdminCalendar props
    const slots = (data?.slots || []).map((s: any) => ({
        ...s,
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime)
    }))

    const lessons = (data?.lessons || []).map(l => ({
        ...l,
        startTime: new Date(l.startTime),
        endTime: new Date(l.endTime)
    }))

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">スケジュール管理</h1>
                    <p className="text-slate-500">教室全体の空き枠・レッスン管理</p>
                </div>
                <div className="flex gap-2">
                    <SyncButton currentDate={date} roomId="A" />
                    <SyncButton currentDate={date} roomId="B" />
                </div>
            </div>

            <AdminCalendar
                initialDate={date}
                slots={slots}
                lessons={lessons}
            />
        </div>
    )
}
