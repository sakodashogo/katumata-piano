import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { TeacherMonthlyAvailabilityManager } from "@/components/teacher/TeacherMonthlyAvailabilityManager"
import { getTeacherWorkingHoursSafe } from "@/lib/teacher-working-hours"

export default async function AvailabilitiesPage({
    searchParams,
}: {
    searchParams: Promise<{ year?: string; month?: string; student?: string }>
}) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const params = await searchParams
    const now = new Date()
    const year = params.year ? Number.parseInt(params.year, 10) : now.getFullYear()
    const month = params.month ? Number.parseInt(params.month, 10) : now.getMonth() + 1

    const [students, workingHours] = await Promise.all([
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
    ])

    const initialStudentId =
        (params.student && students.some((student) => student.id === params.student) ? params.student : undefined) ??
        students[0]?.id ??
        null

    const formattedStudents = students.map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        availability: student.monthlyAvailabilities[0] ?? null,
    }))

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">生徒の希望（代行入力）</h1>
                <p className="text-slate-500">月ごとの提出状況確認と、先生による希望時間の代行入力を行います。</p>
            </div>

            <TeacherMonthlyAvailabilityManager
                year={year}
                month={month}
                students={formattedStudents}
                initialStudentId={initialStudentId}
                workingHours={workingHours}
            />
        </div>
    )
}
