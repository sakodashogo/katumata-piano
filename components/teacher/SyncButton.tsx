"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw } from "lucide-react"
import { syncScheduleFromGoogle } from "@/app/lib/actions/cal-sync"
import { addDays, format, startOfWeek, endOfWeek } from "date-fns"
import { toast } from "sonner" // Assuming sonner is used, or alert/console if not.

export function SyncButton({ currentDate, roomId }: { currentDate: Date, roomId: string }) {
    const [isPending, startTransition] = useTransition()

    // Sync current week + next 4 weeks (standard planning horizon)
    const handleSync = () => {
        startTransition(async () => {
            const start = startOfWeek(currentDate, { weekStartsOn: 1 })
            const end = addDays(start, 28) // 4 weeks

            try {
                const res = await syncScheduleFromGoogle(start.toISOString(), end.toISOString(), roomId)
                if (res.success) {
                    alert(`Sync complete! created/verified slots.`)
                    // In a real app, use toast.success
                } else {
                    alert(`Sync failed: ${res.error}`)
                }
            } catch (e) {
                alert("An unexpected error occurred.")
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
            {isPending ? "Syncing..." : "Sync GCal"}
        </Button>
    )
}
