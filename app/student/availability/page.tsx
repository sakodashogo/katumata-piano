import { auth } from "@/auth"
import { getMonthlyAvailability } from "@/app/lib/actions/availability"
import AvailabilityPageClient from "./client"
import { redirect } from "next/navigation"

export default async function AvailabilityPage({
    searchParams
}: {
    searchParams: { year?: string, month?: string }
}) {
    // Await searchParams before accessing properties
    const params = await Promise.resolve(searchParams)

    const session = await auth()
    if (!session?.user || session.user.role !== "STUDENT") {
        redirect("/login")
    }

    const now = new Date()
    // Defaults to current month
    const year = params.year ? parseInt(params.year) : now.getFullYear()
    const month = params.month ? parseInt(params.month) : now.getMonth() + 1

    const result = await getMonthlyAvailability(session.user.id, year, month)
    const data = result.success ? result.data : null

    return (
        <AvailabilityPageClient
            initialData={data}
            year={year}
            month={month}
            studentId={session.user.id}
        />
    )
}
