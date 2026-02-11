import { getMenus } from "@/app/lib/actions/booking"
import { BookingWizard } from "@/components/student/BookingWizard"

export default async function BookingPage() {
    const { data: menus = [] } = await getMenus()

    return (
        <div className="container max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-8 text-center">Book a Lesson</h1>
            <BookingWizard menus={menus as any[]} />
        </div>
    )
}
