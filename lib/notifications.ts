export type NotificationEventType =
    | "BOOKING_COMPLETED"
    | "RESCHEDULE_COMPLETED"
    | "LESSON_CANCELLED"
    | "MONTHLY_SCHEDULE_FINALIZED"

const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL

export async function notifyEvent(type: NotificationEventType, payload: Record<string, unknown>) {
    if (!GAS_WEBHOOK_URL) return

    try {
        await fetch(GAS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type,
                timestamp: new Date().toISOString(),
                ...payload,
            }),
        })
    } catch (error) {
        console.error("Failed to send notification:", error)
    }
}
