import { getMenus, getStudentCredits } from "@/app/lib/actions/booking"
import { BookingWizard } from "@/components/student/BookingWizard"
import { auth } from "@/auth"

export default async function BookingPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await auth()
    const params = await searchParams

    // Parallel fetch
    const [menusData, credits] = await Promise.all([
        getMenus(),
        session?.user?.id ? getStudentCredits(session.user.id) : null
    ])

    const menus = menusData.data || []

    const rescheduleId = params.rescheduleId as string | undefined
    const menuId = params.menuId as string | undefined

    return (
        <div className="container max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8 text-center">
                {rescheduleId ? "日時変更" : "レッスン予約"}
            </h1>
            <BookingWizard
                menus={menus as any[]}
                rescheduleLessonId={rescheduleId}
                initialMenuId={menuId}
                credits={credits}
            />
        </div>
    )
}
