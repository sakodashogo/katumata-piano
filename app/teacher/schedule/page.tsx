import { getOpenSlots } from "@/app/lib/actions/schedule"
import { WeeklySchedule } from "@/components/teacher/WeeklySchedule"
import { startOfWeek, endOfWeek } from "date-fns"

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

    const { data: slots = [] } = await getOpenSlots(room, start, end)

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">スケジュール管理</h1>
                    <p className="text-slate-500">Room {room} の空き枠管理</p>
                </div>
                <SyncButton currentDate={date} roomId={room} />
            </div>

            <WeeklySchedule roomId={room} date={date} slots={slots as any[]} />
        </div>
    )
}
