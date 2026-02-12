import { getBookableMenusForStudent, getMenus, getStudentCredits } from "@/app/lib/actions/booking"
import { BookingWizard } from "@/components/student/BookingWizard"
import { auth } from "@/auth"

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
    const session = await auth()
    const params = await searchParams

    const rescheduleId = params.reschedule as string | undefined
    const menuId = params.menu as string | undefined
    const shouldUseAllMenus = !!rescheduleId

    // Parallel fetch
    const [menusData, credits] = await Promise.all([
        shouldUseAllMenus ? getMenus() : getBookableMenusForStudent(),
        session?.user?.id ? getStudentCredits(session.user.id) : null
    ])

    const menus = menusData.data || []

    return (
        <div className="container max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8 text-center">
                {rescheduleId ? "日時変更" : "レッスン予約"}
            </h1>
            <BookingWizard
                menus={menus as BookingMenu[]}
                rescheduleLessonId={rescheduleId}
                initialMenuId={menuId}
                credits={credits}
            />
        </div>
    )
}
