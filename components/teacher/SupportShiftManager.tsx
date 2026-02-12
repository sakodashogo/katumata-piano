"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { deleteSupportShift, upsertSupportShift } from "@/app/lib/actions/support"

type SupportStaff = {
    id: string
    name: string
    active: boolean
}

type SupportShift = {
    id: string
    staffId: string
    startTime: string
    endTime: string
    staff?: { id: string; name: string; active: boolean } | null
}

export function SupportShiftManager({
    staff,
    shifts,
}: {
    staff: SupportStaff[]
    shifts: SupportShift[]
}) {
    const { toast } = useToast()
    const router = useRouter()
    const [staffId, setStaffId] = useState(staff[0]?.id ?? "")
    const [startTime, setStartTime] = useState("")
    const [endTime, setEndTime] = useState("")
    const [isSaving, setIsSaving] = useState(false)

    const sortedShifts = useMemo(
        () => [...shifts].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
        [shifts]
    )

    const handleCreate = async () => {
        if (!staffId || !startTime || !endTime) {
            toast.error("講師・開始・終了を入力してください。")
            return
        }
        setIsSaving(true)
        const res = await upsertSupportShift({
            staffId,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
        })
        setIsSaving(false)
        if (!res.success) {
            toast.error(res.error || "保存に失敗しました。")
            return
        }
        toast.success("シフトを保存しました。")
        router.refresh()
    }

    const handleDelete = async (id: string) => {
        const res = await deleteSupportShift(id)
        if (!res.success) {
            toast.error(res.error || "削除に失敗しました。")
            return
        }
        toast.success("削除しました。")
        router.refresh()
    }

    return (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">サポート講師シフト</h3>
            <p className="mt-1 text-xs text-slate-500">第2レッスン室で通常レッスンを入れられる時間帯を管理します。</p>

            {staff.length === 0 && (
                <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    サポート講師データがありません。DBマイグレーション後に講師データを登録してください。
                </p>
            )}

            <div className="mt-3 grid gap-2 md:grid-cols-4">
                <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-9 rounded border px-2 text-sm">
                    {staff.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                </select>
                <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-9 rounded border px-2 text-sm"
                />
                <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-9 rounded border px-2 text-sm"
                />
                <Button onClick={handleCreate} disabled={isSaving || staff.length === 0}>{isSaving ? "保存中..." : "追加"}</Button>
            </div>

            <div className="mt-3 space-y-2">
                {sortedShifts.length === 0 && <p className="text-xs text-slate-500">登録済みシフトはありません。</p>}
                {sortedShifts.map((shift) => (
                    <div key={shift.id} className="flex items-center justify-between rounded border bg-slate-50 px-3 py-2 text-xs">
                        <div>
                            <span className="font-semibold text-slate-700">{shift.staff?.name || "サポート講師"}</span>
                            <span className="ml-2 text-slate-600">
                                {format(new Date(shift.startTime), "M/d(E) HH:mm", { locale: ja })}
                                {" - "}
                                {format(new Date(shift.endTime), "HH:mm", { locale: ja })}
                            </span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(shift.id)}>削除</Button>
                    </div>
                ))}
            </div>
        </div>
    )
}
