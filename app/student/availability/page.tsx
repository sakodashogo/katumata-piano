import { getMonthlyAvailability } from "@/app/lib/actions/availability"
import AvailabilityPageClient from "./client"
import { getTeacherWorkingHoursSafe } from "@/lib/teacher-working-hours"
import { getClosedDaysInRangeSafe, getTokyoMonthDateRange } from "@/lib/closed-days"

export default async function AvailabilityPage({
    searchParams
}: {
    searchParams: { year?: string, month?: string }
}) {
    // Await searchParams before accessing properties
    const params = await Promise.resolve(searchParams)

    const now = new Date()
    // Defaults to current month
    const year = params.year ? parseInt(params.year) : now.getFullYear()
    const month = params.month ? parseInt(params.month) : now.getMonth() + 1

    const monthRange = getTokyoMonthDateRange(year, month)
    const [result, workingHours, closedDays] = await Promise.all([
        getMonthlyAvailability(undefined, year, month),
        getTeacherWorkingHoursSafe(),
        monthRange
            ? getClosedDaysInRangeSafe(monthRange.start, monthRange.endExclusive, { scope: "teacher" })
            : Promise.resolve([]),
    ])
    const data = result.success ? result.data : null

    return (
        <AvailabilityPageClient
            initialData={data}
            year={year}
            month={month}
            workingHours={workingHours}
            closedDays={closedDays}
        />
    )
}
