"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { syncScheduleFromGoogle } from "@/app/lib/actions/cal-sync"
import { addDays, startOfWeek } from "date-fns"
import { useToast } from "@/components/ui/toast"

export function SyncButton({ currentDate, roomId }: { currentDate: Date, roomId: string }) {
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()

    // Sync current week + next 4 weeks (standard planning horizon)
    const handleSync = () => {
        startTransition(async () => {
            const start = startOfWeek(currentDate, { weekStartsOn: 1 })
            const end = addDays(start, 28) // 4 weeks

            try {
                const res = await syncScheduleFromGoogle(start.toISOString(), end.toISOString(), roomId)
                if (res.success) {
                    toast.success("同期が完了しました")
                } else {
                    toast.error(`同期に失敗しました: ${res.error}`)
                }
            } catch {
                toast.error("予期しないエラーが発生しました")
            }
        })
    }

    return (
        <Button
            variant="outline"
            onClick={handleSync}
            disabled={isPending}
            className="gap-2"
        >
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? `Room ${roomId} 同期中...` : `Room ${roomId} 同期`}
        </Button>
    )
}
