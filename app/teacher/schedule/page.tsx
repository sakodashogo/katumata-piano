import { getScheduleData } from "@/app/lib/actions/schedule"
import { AdminCalendar } from "@/components/teacher/AdminCalendar"
import { startOfWeek, endOfWeek } from "date-fns"
import { SyncButton } from "@/components/teacher/SyncButton"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

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

export default async function SchedulePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const params = await searchParams
    const dateStr = (params.date as string) || new Date().toISOString().split("T")[0]
    const parsedDate = new Date(dateStr)
    const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate

    const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday start
    const end = endOfWeek(date, { weekStartsOn: 1 })

    const scheduleResult = await getScheduleData(undefined, start, end)

    if (!scheduleResult.success || !scheduleResult.data) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                スケジュールデータの取得に失敗しました。時間をおいて再度お試しください。
            </div>
        )
    }

    const rawSlots = scheduleResult.data.slots as ScheduleSlot[]
    const rawLessons = scheduleResult.data.lessons as ScheduleLesson[]

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
                    <Link href="/teacher/slots" className="font-bold underline underline-offset-2">
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
            />
        </div>
    )
}
