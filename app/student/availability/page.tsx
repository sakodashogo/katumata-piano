import { auth } from "@/auth"
import { getLatestAvailability } from "@/app/lib/actions/availability"
import { AvailabilityForm } from "@/components/student/AvailabilityForm"

export default async function AvailabilityPage() {
    const session = await auth()
    if (!session?.user) return null

    const { data: availability } = await getLatestAvailability(session.user.id!)

    // Transform or pass initial data
    const initialData = availability ? {
        days: availability.days, // Prisma returns JSON, might need casting if strict typing
        note: availability.note
    } : undefined

    return (
        <div className="container max-w-2xl mx-auto py-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">空き状況の登録</h1>
                <p className="text-slate-500">
                    レッスンに参加できる曜日を教えてください。
                </p>
            </div>

            <AvailabilityForm initialData={initialData} />
        </div>
    )
}
