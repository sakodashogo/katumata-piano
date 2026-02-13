"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/toast"
import { Trash2, Upload, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROOMS } from "@/lib/constants"
import { updateSlotDetails, bulkDeleteDraftSlots } from "@/app/lib/actions/slot-management"
import { publishOpenSlots } from "@/app/lib/actions/resource"

type Menu = {
    id: string
    name: string
    durationMin: number
}

type SlotWithMenu = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    isPublic: boolean
    menuId: string | null
    durationMin: number
    menu: Menu | null
}

type Props = {
    draftSlots: SlotWithMenu[]
    menus: Menu[]
}

const DURATION_OPTIONS = [30, 45, 60]

export function DraftSlotList({ draftSlots, menus }: Props) {
    const router = useRouter()
    const { toast } = useToast()
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [filterRoom, setFilterRoom] = useState<string>("all")
    const [filterMenu, setFilterMenu] = useState<string>("all")

    const filteredSlots = draftSlots.filter(slot => {
        if (filterRoom !== "all" && slot.roomId !== filterRoom) return false
        if (filterMenu !== "all") {
            if (filterMenu === "none" && slot.menuId !== null) return false
            if (filterMenu !== "none" && slot.menuId !== filterMenu) return false
        }
        return true
    })

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const selectAll = () => {
        if (selectedIds.size === filteredSlots.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredSlots.map(s => s.id)))
        }
    }

    const handleDurationChange = async (slotId: string, newDuration: number) => {
        const result = await updateSlotDetails(slotId, { durationMin: newDuration })
        if (result.success) {
            router.refresh()
        } else {
            toast.error("更新に失敗しました。")
        }
    }

    const handleMenuChange = async (slotId: string, newMenuId: string) => {
        const result = await updateSlotDetails(slotId, {
            menuId: newMenuId === "" ? null : newMenuId,
        })
        if (result.success) {
            router.refresh()
        } else {
            toast.error("更新に失敗しました。")
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`${selectedIds.size}件の下書き枠を削除しますか？`)) return

        setIsSubmitting(true)
        const result = await bulkDeleteDraftSlots(Array.from(selectedIds))
        setIsSubmitting(false)

        if (result.success) {
            toast.success(`${result.count}件を削除しました。`)
            setSelectedIds(new Set())
            router.refresh()
        } else {
            toast.error("削除に失敗しました。")
        }
    }

    const handleBulkPublish = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`${selectedIds.size}件の枠を公開しますか？`)) return

        setIsSubmitting(true)
        const result = await publishOpenSlots(Array.from(selectedIds))
        setIsSubmitting(false)

        if (result.success) {
            const publishedCount = typeof result.publishedCount === "number" ? result.publishedCount : 0
            const skippedClosed = typeof result.skippedClosedCount === "number" ? result.skippedClosedCount : 0
            if (skippedClosed > 0) {
                toast.info(`公開${publishedCount}件 / お休み重複でスキップ${skippedClosed}件`)
            } else {
                toast.success(`${publishedCount}件を公開しました。`)
            }
            setSelectedIds(new Set())
            router.refresh()
        } else {
            toast.error("公開に失敗しました。")
        }
    }

    if (draftSlots.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
                <p className="text-slate-400 text-lg">下書き枠がありません</p>
                <p className="text-slate-400 text-sm mt-1">「一括作成」タブから枠を作成してください</p>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={selectAll}>
                        {selectedIds.size === filteredSlots.length ? "全解除" : "全選択"}
                    </Button>
                    <span className="text-sm text-slate-500">{draftSlots.length}件の下書き</span>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={filterRoom}
                        onChange={(e) => setFilterRoom(e.target.value)}
                        className="border rounded-md px-2 py-1.5 text-sm bg-white"
                    >
                        <option value="all">全教室</option>
                        <option value="A">{ROOMS.A.name}</option>
                        <option value="B">{ROOMS.B.name}</option>
                    </select>
                    <select
                        value={filterMenu}
                        onChange={(e) => setFilterMenu(e.target.value)}
                        className="border rounded-md px-2 py-1.5 text-sm bg-white"
                    >
                        <option value="all">全メニュー</option>
                        <option value="none">指定なし</option>
                        {menus.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr>
                            <th className="w-10 p-3"></th>
                            <th className="text-left p-3 font-medium">日付</th>
                            <th className="text-left p-3 font-medium">時間</th>
                            <th className="text-left p-3 font-medium">教室</th>
                            <th className="text-left p-3 font-medium">メニュー</th>
                            <th className="text-left p-3 font-medium">時間</th>
                            <th className="w-10 p-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredSlots.map(slot => (
                            <tr
                                key={slot.id}
                                className={cn(
                                    "hover:bg-slate-50 transition-colors",
                                    selectedIds.has(slot.id) && "bg-blue-50/50"
                                )}
                            >
                                <td className="p-3 text-center">
                                    <Checkbox
                                        checked={selectedIds.has(slot.id)}
                                        onCheckedChange={() => toggleSelect(slot.id)}
                                    />
                                </td>
                                <td className="p-3 font-medium text-slate-700">
                                    {format(slot.startTime, "M/d (E)", { locale: ja })}
                                </td>
                                <td className="p-3 text-slate-600">
                                    {format(slot.startTime, "HH:mm")} - {format(slot.endTime, "HH:mm")}
                                </td>
                                <td className="p-3">
                                    <span className={cn(
                                        "text-xs font-medium px-2 py-0.5 rounded",
                                        slot.roomId === "A" ? "bg-purple-50 text-purple-700" : "bg-teal-50 text-teal-700"
                                    )}>
                                        Room {slot.roomId}
                                    </span>
                                </td>
                                <td className="p-3">
                                    <select
                                        value={slot.menuId || ""}
                                        onChange={(e) => handleMenuChange(slot.id, e.target.value)}
                                        className="border rounded px-2 py-1 text-sm bg-white max-w-[140px]"
                                    >
                                        <option value="">指定なし</option>
                                        {menus.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="p-3">
                                    <select
                                        value={slot.durationMin}
                                        onChange={(e) => handleDurationChange(slot.id, Number(e.target.value))}
                                        className="border rounded px-2 py-1 text-sm bg-white w-20"
                                    >
                                        {DURATION_OPTIONS.map(d => (
                                            <option key={d} value={d}>{d}分</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="p-3">
                                    <button
                                        onClick={async () => {
                                            const result = await bulkDeleteDraftSlots([slot.id])
                                            if (result.success) {
                                                router.refresh()
                                            } else {
                                                toast.error("削除に失敗しました。")
                                            }
                                        }}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="sticky bottom-0 flex items-center justify-between p-4 border-t bg-white/95 backdrop-blur-sm">
                    <span className="text-sm font-medium text-slate-700">
                        {selectedIds.size}件を選択中
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleBulkDelete}
                            disabled={isSubmitting}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                            選択を削除
                        </Button>
                        <Button
                            onClick={handleBulkPublish}
                            disabled={isSubmitting}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            size="sm"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                            一括公開する
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
