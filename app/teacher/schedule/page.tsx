import { getOpenSlots } from "@/app/lib/actions/schedule"
import { WeeklySchedule } from "@/components/teacher/WeeklySchedule"
import { startOfWeek, endOfWeek } from "date-fns"

export default async function SchedulePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }> // Updated for Next.js 15+ async searchParams
}) {
    const params = await searchParams // Await searchParams in newer Next.js versions
    const room = (params.room as string) || "A"
    const dateStr = (params.date as string) || new Date().toISOString().split("T")[0]
    const date = new Date(dateStr)

    const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday start
    const end = endOfWeek(date, { weekStartsOn: 1 })

    const { data: slots = [] } = await getOpenSlots(room, start, end)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Schedule Management</h1>
                <p className="text-slate-500">Manage open slots for Room {room}</p>
            </div>

            <WeeklySchedule roomId={room} date={date} slots={slots as any[]} />
        </div>
    )
}
