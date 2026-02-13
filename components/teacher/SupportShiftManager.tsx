"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
    createMonthlySupportShifts,
    createSupportStaff,
    deleteSupportShift,
    setSupportStaffActive,
    upsertSupportShift,
} from "@/app/lib/actions/support"

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
    const activeStaff = useMemo(() => staff.filter((member) => member.active), [staff])
    const [newStaffName, setNewStaffName] = useState("")
    const [staffId, setStaffId] = useState(activeStaff[0]?.id ?? "")
    const [startTime, setStartTime] = useState("")
    const [endTime, setEndTime] = useState("")
    const [monthValue, setMonthValue] = useState(format(new Date(), "yyyy-MM"))
    const [weekdayFlags, setWeekdayFlags] = useState<Record<number, boolean>>({
        1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 0: false,
    })
    const [monthStartTime, setMonthStartTime] = useState("14:00")
    const [monthEndTime, setMonthEndTime] = useState("20:00")
    const [isSaving, setIsSaving] = useState(false)
    const selectedStaffId = activeStaff.some((member) => member.id === staffId) ? staffId : (activeStaff[0]?.id ?? "")

    const sortedShifts = useMemo(
        () => [...shifts].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
        [shifts]
    )

    const handleCreate = async () => {
        if (!selectedStaffId || !startTime || !endTime) {
            toast.error("講師・開始・終了を入力してください。")
            return
        }
        setIsSaving(true)
        const res = await upsertSupportShift({
            staffId: selectedStaffId,
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

    const handleCreateStaff = async () => {
        if (!newStaffName.trim()) {
            toast.error("講師名を入力してください。")
            return
        }
        const res = await createSupportStaff(newStaffName.trim())
        if (!res.success) {
            toast.error(res.error || "講師登録に失敗しました。")
            return
        }
        toast.success("サポート講師を登録しました。")
        setNewStaffName("")
        router.refresh()
    }

    const handleToggleStaff = async (target: SupportStaff) => {
        const res = await setSupportStaffActive(target.id, !target.active)
        if (!res.success) {
            toast.error(res.error || "講師状態の更新に失敗しました。")
            return
        }
        toast.success(target.active ? "無効化しました。" : "有効化しました。")
        router.refresh()
    }

    const handleMonthlyCreate = async () => {
        if (!selectedStaffId) {
            toast.error("講師を選択してください。")
            return
        }
        const [yearStr, monthStr] = monthValue.split("-")
        const [startH, startM] = monthStartTime.split(":").map(Number)
        const [endH, endM] = monthEndTime.split(":").map(Number)
        const weekdays = Object.entries(weekdayFlags)
            .filter(([, enabled]) => enabled)
            .map(([day]) => Number(day))

        const res = await createMonthlySupportShifts({
            staffId: selectedStaffId,
            year: Number(yearStr),
            month: Number(monthStr),
            weekdays,
            startHour: startH,
            startMinute: startM,
            endHour: endH,
            endMinute: endM,
        })
        if (!res.success) {
            toast.error(res.error || "月間登録に失敗しました。")
            return
        }
        const skippedClosed = typeof res.skippedClosed === "number" ? res.skippedClosed : 0
        const skippedOutside = typeof res.skippedOutsideWorkingHours === "number" ? res.skippedOutsideWorkingHours : 0
        if (skippedClosed > 0 || skippedOutside > 0) {
            toast.info(`月間登録完了: 追加${res.created}件 / 重複等${res.skipped}件 / お休み重複${skippedClosed}件 / 時間外${skippedOutside}件`)
        } else {
            toast.success(`月間登録完了: 追加${res.created}件 / スキップ${res.skipped}件`)
        }
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
            <h3 className="text-sm font-bold text-slate-900">サポート講師・シフト管理</h3>
            <p className="mt-1 text-xs text-slate-500">講師登録、単発シフト、月間一括登録をこの画面で管理できます。</p>

            <div className="mt-4 rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">サポート講師を登録</p>
                <div className="mt-2 flex flex-col gap-2 md:flex-row">
                    <input
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        placeholder="例: バイトC"
                        className="h-9 flex-1 rounded border px-2 text-sm"
                    />
                    <Button onClick={handleCreateStaff}>講師を追加</Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {staff.map((member) => (
                        <div key={member.id} className="inline-flex items-center gap-2 rounded border bg-white px-2 py-1 text-xs">
                            <span className={member.active ? "text-slate-800" : "text-slate-400 line-through"}>
                                {member.name}
                            </span>
                            <Button size="sm" variant="outline" onClick={() => handleToggleStaff(member)}>
                                {member.active ? "無効化" : "有効化"}
                            </Button>
                        </div>
                    ))}
                </div>
            </div>

            {activeStaff.length === 0 && (
                <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    有効なサポート講師がいません。先に講師登録してください。
                </p>
            )}

            <div className="mt-4 rounded-lg border bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-800">月間シフト一括登録</p>
                <div className="mt-2 grid gap-2 md:grid-cols-6">
                    <select value={selectedStaffId} onChange={(e) => setStaffId(e.target.value)} className="h-9 rounded border px-2 text-sm">
                        {activeStaff.map((member) => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                    </select>
                    <input
                        type="month"
                        value={monthValue}
                        onChange={(e) => setMonthValue(e.target.value)}
                        className="h-9 rounded border px-2 text-sm"
                    />
                    <input
                        type="time"
                        value={monthStartTime}
                        onChange={(e) => setMonthStartTime(e.target.value)}
                        className="h-9 rounded border px-2 text-sm"
                    />
                    <input
                        type="time"
                        value={monthEndTime}
                        onChange={(e) => setMonthEndTime(e.target.value)}
                        className="h-9 rounded border px-2 text-sm"
                    />
                    <div className="col-span-2 flex flex-wrap items-center gap-1 rounded border bg-white px-2 py-1 text-xs">
                        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                            <label key={day} className="inline-flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={weekdayFlags[day]}
                                    onChange={(e) =>
                                        setWeekdayFlags((prev) => ({ ...prev, [day]: e.target.checked }))
                                    }
                                />
                                {["日", "月", "火", "水", "木", "金", "土"][day]}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="mt-2 flex justify-end">
                    <Button onClick={handleMonthlyCreate} disabled={activeStaff.length === 0}>
                        月間一括登録
                    </Button>
                </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-4">
                <select value={selectedStaffId} onChange={(e) => setStaffId(e.target.value)} className="h-9 rounded border px-2 text-sm">
                    {activeStaff.map((member) => (
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
                <Button onClick={handleCreate} disabled={isSaving || activeStaff.length === 0}>{isSaving ? "保存中..." : "単発追加"}</Button>
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
