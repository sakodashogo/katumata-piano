import { getMenusForSlots, getDraftSlots, getAllSlotsByMonth } from "@/app/lib/actions/slot-management"
import { SlotManager } from "@/components/teacher/SlotManager"

export default async function SlotsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const now = new Date()
    const year = Number(params.year) || now.getFullYear()
    const month = Number(params.month) || now.getMonth() + 1

    const [menusResult, draftsResult, allSlotsResult] = await Promise.all([
        getMenusForSlots(),
        getDraftSlots(year, month),
        getAllSlotsByMonth(year, month),
    ])

    const menus = menusResult.success && menusResult.data ? menusResult.data : []
    const draftSlots = (draftsResult.success && draftsResult.data ? draftsResult.data : []).map(s => ({
        ...s,
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime),
    }))
    const allSlots = (allSlotsResult.success && allSlotsResult.data ? allSlotsResult.data : []).map(s => ({
        ...s,
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime),
    }))

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">空き枠管理</h1>
                <p className="text-slate-500">空き枠の一括作成・編集・公開</p>
            </div>

            <SlotManager
                year={year}
                month={month}
                menus={menus}
                draftSlots={draftSlots}
                allSlots={allSlots}
            />
        </div>
    )
}
