import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { TeacherMonthlyAvailabilityManager } from "@/components/teacher/TeacherMonthlyAvailabilityManager"
import { getTeacherWorkingHoursSafe } from "@/lib/teacher-working-hours"
import { getCachedSession } from "@/lib/session"
import { unstable_cache } from "next/cache"
import { TEACHER_AVAILABILITIES_PAGE_CACHE_TAG } from "@/lib/cache-tags"
import { CLOSED_DAYS_CACHE_TAG, getClosedDaysInRangeSafe, getTokyoMonthDateRange } from "@/lib/closed-days"

const TEACHER_AVAILABILITIES_REVALIDATE_SECONDS = 60

const getTeacherAvailabilitiesPageData = unstable_cache(
    async (year: number, month: number) => {
        const monthRange = getTokyoMonthDateRange(year, month)
        const [students, workingHours, closedDays] = await Promise.all([
            prisma.user.findMany({
                where: { role: "STUDENT" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    monthlyAvailabilities: {
                        where: { year, month },
                        orderBy: { updatedAt: "desc" },
                        take: 1,
                    },
                },
                orderBy: [{ name: "asc" }, { email: "asc" }],
            }),
            getTeacherWorkingHoursSafe(),
            monthRange
                ? getClosedDaysInRangeSafe(monthRange.start, monthRange.endExclusive, { scope: "teacher" })
                : Promise.resolve([]),
        ])

        const formattedStudents = students.map((student) => ({
            id: student.id,
            name: student.name,
            email: student.email,
            availability: student.monthlyAvailabilities[0] ?? null,
        }))

        return { students: formattedStudents, workingHours, closedDays }
    },
    ["teacher-availabilities-page:v1"],
    {
        revalidate: TEACHER_AVAILABILITIES_REVALIDATE_SECONDS,
        tags: [TEACHER_AVAILABILITIES_PAGE_CACHE_TAG, CLOSED_DAYS_CACHE_TAG],
    }
)

export default async function AvailabilitiesPage({
    searchParams,
}: {
    searchParams: Promise<{ year?: string; month?: string; student?: string }>
}) {
    const session = await getCachedSession()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const params = await searchParams
    const now = new Date()
    const year = params.year ? Number.parseInt(params.year, 10) : now.getFullYear()
    const month = params.month ? Number.parseInt(params.month, 10) : now.getMonth() + 1

    const { students, workingHours, closedDays } = await getTeacherAvailabilitiesPageData(year, month)

    const initialStudentId =
        (params.student && students.some((student) => student.id === params.student) ? params.student : undefined) ??
        students[0]?.id ??
        null

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">生徒の希望（代行入力）</h1>
                <p className="text-slate-500">月ごとの提出状況確認と、先生による希望時間の代行入力を行います。</p>
            </div>

            <TeacherMonthlyAvailabilityManager
                year={year}
                month={month}
                students={students}
                initialStudentId={initialStudentId}
                workingHours={workingHours}
                closedDays={closedDays}
            />
        </div>
    )
}
