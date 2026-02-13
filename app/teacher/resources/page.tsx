import { getOpenSlots } from "@/app/lib/actions/resource"
import { ResourceManager } from "@/components/teacher/ResourceManager"
import { getYear, getMonth } from "date-fns"

export default async function ResourcesPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string }>
}) {
    const params = await searchParams
    const now = new Date()
    const year = params.year ? parseInt(params.year) : getYear(now)
    const month = params.month ? parseInt(params.month) : getMonth(now) + 1

    const result = await getOpenSlots(year, month)
    const slots = result.success ? (result.data?.slots ?? []) : []
    const lessons = result.success ? (result.data?.lessons ?? []) : []
    const supportShifts = result.success ? (result.data?.supportShifts ?? []) : []

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">リソース可視化</h1>
                    <p className="text-slate-500">ピアノ室 A・B の稼働状況を日別に確認します。</p>
                </div>
            </div>

            <ResourceManager
                initialSlots={slots}
                initialLessons={lessons}
                supportShifts={supportShifts}
                year={year}
                month={month}
            />
        </div>
    )
}
