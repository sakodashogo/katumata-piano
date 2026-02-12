"use client"

import { useState } from "react"
import { cancelLesson } from "@/app/lib/actions/booking"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { CalendarClock, X, Loader2 } from "lucide-react"
import Link from "next/link"
import { BOOKING_RULES } from "@/lib/constants"
import { addHours, format } from "date-fns"
import { ja } from "date-fns/locale"

export function LessonActions({ lessonId, menuId, startTime }: { lessonId: string; menuId?: string; startTime: string | Date }) {
    const [showCancel, setShowCancel] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()
    const router = useRouter()
    const lessonStart = new Date(startTime)
    const deadline = addHours(lessonStart, -BOOKING_RULES.CANCELLATION_HOURS_BEFORE)
    const canModify = new Date() <= deadline

    async function handleCancel() {
        if (!canModify) return
        setLoading(true)
        const res = await cancelLesson(lessonId) as { success: boolean; error?: string }
        if (res.success) {
            toast.success("レッスンをキャンセルしました")
            router.refresh()
        } else {
            toast.error(res.error || "キャンセルに失敗しました")
        }
        setLoading(false)
    }

    return (
        <div className="space-y-1">
            <div className="flex gap-2">
                <Link
                    href={`/student/book?reschedule=${lessonId}${menuId ? `&menu=${menuId}` : ""}`}
                    aria-disabled={!canModify}
                    className={!canModify ? "pointer-events-none opacity-50" : ""}
                >
                    <Button variant="outline" size="sm" className="gap-1" disabled={!canModify}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        日時変更
                    </Button>
                </Link>
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setShowCancel(true)}
                    disabled={loading || !canModify}
                >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    キャンセル
                </Button>
            </div>
            <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-[11px] text-slate-500 justify-start"
                disabled
            >
                {canModify
                    ? `変更可能: ${format(deadline, "M/d HH:mm", { locale: ja })}まで`
                    : "2日前を過ぎたため変更できません"}
            </Button>

            <ConfirmDialog
                open={showCancel}
                onOpenChange={setShowCancel}
                title="レッスンをキャンセル"
                description={
                    <div className="space-y-2">
                        <p>このレッスンをキャンセルしてもよろしいですか？</p>
                        <p className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-800 text-xs font-bold ring-4 ring-amber-50/50">
                            【注意】レッスン開始の2日前までキャンセル可能です。
                        </p>
                    </div>
                }
                confirmLabel="キャンセルを確定する"
                onConfirm={handleCancel}
                destructive
            />
        </div>
    )
}
