"use client"

import { useState } from "react"
import { cancelLesson } from "@/app/lib/actions/booking"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { CalendarClock, X, Loader2 } from "lucide-react"
import Link from "next/link"

export function LessonActions({ lessonId, menuId }: { lessonId: string; menuId?: string }) {
    const [showCancel, setShowCancel] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    async function handleCancel() {
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
        <div className="flex gap-2">
            <Link href={`/student/book?reschedule=${lessonId}${menuId ? `&menu=${menuId}` : ""}`}>
                <Button variant="outline" size="sm" className="gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    日時変更
                </Button>
            </Link>
            <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => setShowCancel(true)}
                disabled={loading}
            >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                キャンセル
            </Button>

            <ConfirmDialog
                open={showCancel}
                onOpenChange={setShowCancel}
                title="レッスンをキャンセル"
                description="このレッスンをキャンセルしてもよろしいですか？キャンセル後、枠は他の生徒に開放されます。"
                confirmLabel="キャンセルする"
                onConfirm={handleCancel}
                destructive
            />
        </div>
    )
}
