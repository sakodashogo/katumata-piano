import {
    getBookableMenusForStudent,
    getMenus,
    getReschedulePolicy,
    getStudentCredits,
} from "@/app/lib/actions/booking"
import { BookingWizard } from "@/components/student/BookingWizard"

type BookingMenu = {
    id: string
    name: string
    durationMin: number
    price: number
    description: string | null
}

export default async function BookingPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams

    const rescheduleId = params.reschedule as string | undefined
    const menuId = params.menu as string | undefined
    const shouldUseAllMenus = !!rescheduleId

    // Parallel fetch
    const [menusData, credits, reschedulePolicy] = await Promise.all([
        shouldUseAllMenus ? getMenus() : getBookableMenusForStudent(),
        getStudentCredits(),
        rescheduleId ? getReschedulePolicy(rescheduleId) : null,
    ])

    const menus = menusData.data || []
    const policy = reschedulePolicy?.success ? reschedulePolicy.data : null

    return (
        <div className="container max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8 text-center">
                {rescheduleId ? "日時変更" : "レッスン予約"}
            </h1>
            {rescheduleId && !policy && (
                <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {reschedulePolicy?.error || "振替条件を取得できませんでした。"}
                </p>
            )}
            <BookingWizard
                menus={menus as BookingMenu[]}
                rescheduleLessonId={rescheduleId}
                initialMenuId={menuId}
                credits={credits}
                reschedulePolicy={policy}
            />
        </div>
    )
}
