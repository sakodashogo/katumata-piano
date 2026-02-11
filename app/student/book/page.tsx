```
import { getMenus } from "@/app/lib/actions/booking"
import { BookingWizard } from "@/components/student/BookingWizard"

export default async function BookingPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { data: menus = [] } = await getMenus()
    
    const rescheduleId = params.rescheduleId as string | undefined
    const menuId = params.menuId as string | undefined

    return (
        <div className="container max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8 text-center">
                {rescheduleId ? "Reschedule Lesson" : "Book a Lesson"}
            </h1>
            <BookingWizard 
                menus={menus as any[]} 
                rescheduleLessonId={rescheduleId}
                initialMenuId={menuId}
            />
        </div>
    )
}
```
