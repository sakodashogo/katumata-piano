import { PlanningBoard } from "@/components/teacher/PlanningBoard"
import { getPlanningData } from "@/app/lib/actions/planning"

export default async function PlanningPage() {
    const { students } = await getPlanningData()

    return (
        <main className="p-6 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">レッスンスケジュール策定</h1>
                <p className="text-slate-500">生徒ごとの固定枠をパズルのように組み合わせて、月間の予定を作成します。</p>
            </div>

            <PlanningBoard students={students || []} />
        </main>
    )
}
