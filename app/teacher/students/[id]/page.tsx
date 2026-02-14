import { prisma } from "@/lib/prisma"
import { getStudentHistory } from "@/app/lib/actions/lesson"
import { getMonthlyAvailability } from "@/app/lib/actions/availability"
import { LessonReportDialog } from "@/components/teacher/LessonReportDialog"
import { StudentAvailabilityCard } from "@/components/teacher/StudentAvailabilityCard"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { LESSON_STATUS_LABELS } from "@/lib/constants"
import { StudentEditDialog } from "@/components/teacher/StudentEditDialog"
import { redirect } from "next/navigation"
import { getTeacherWorkingHoursSafe } from "@/lib/teacher-working-hours"
import { getCachedSession } from "@/lib/session"

export default async function StudentDetailPage({
    params,
    searchParams
}: {
    params: { id: string },
    searchParams: { year?: string, month?: string }
}) {
    const session = await getCachedSession()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    // Await params and searchParams before using
    const { id } = await Promise.resolve(params);
    const resolvedSearchParams = await Promise.resolve(searchParams);

    const student = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            defaultLessonCount: true,
            createdAt: true,
        },
    })

    if (!student) return <div>生徒が見つかりません</div>

    const now = new Date()
    const parsedYear = resolvedSearchParams.year ? Number.parseInt(resolvedSearchParams.year, 10) : NaN
    const parsedMonth = resolvedSearchParams.month ? Number.parseInt(resolvedSearchParams.month, 10) : NaN
    const year = Number.isFinite(parsedYear) ? parsedYear : now.getFullYear()
    const month = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : now.getMonth() + 1

    const [{ data: lessons }, { data: availability }, workingHours] = await Promise.all([
        getStudentHistory(id),
        getMonthlyAvailability(id, year, month),
        getTeacherWorkingHoursSafe(),
    ])

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">{student.name}</h1>
                <p className="text-slate-500">{student.email}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>レッスン履歴</CardTitle>
                        <CardDescription>過去のレッスンとレポート</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {lessons?.map((lesson) => (
                                <div key={lesson.id} className="border rounded-lg p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-semibold">
                                                {format(lesson.startTime, "yyyy年M月d日", { locale: ja })}
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                {format(lesson.startTime, "HH:mm")} - {format(lesson.endTime, "HH:mm")}
                                            </div>
                                        </div>
                                        <Badge variant={lesson.status === "COMPLETED" ? "default" : "secondary"}>
                                            {LESSON_STATUS_LABELS[lesson.status] || lesson.status}
                                        </Badge>
                                    </div>

                                    {(lesson.report || lesson.homework) && (
                                        <div className="bg-slate-50 p-3 rounded text-sm space-y-2">
                                            {lesson.report && (
                                                <div>
                                                    <span className="font-semibold text-slate-700">講師メモ: </span>
                                                    {lesson.report}
                                                </div>
                                            )}
                                            {lesson.homework && (
                                                <div>
                                                    <span className="font-semibold text-slate-700">宿題: </span>
                                                    {lesson.homework}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex justify-end">
                                        <LessonReportDialog lesson={lesson} />
                                    </div>
                                </div>
                            ))}
                            {(!lessons || lessons.length === 0) && (
                                <div className="text-center text-slate-500 py-8">
                                    レッスン履歴はありません。
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle>プロフィール</CardTitle>
                            <StudentEditDialog student={student} />
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div>
                                <div className="text-sm font-medium text-slate-500">メール</div>
                                <div>{student.email}</div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-500">月間レッスン回数</div>
                                <div>{student.defaultLessonCount}回</div>
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-500">登録日</div>
                                <div>{format(student.createdAt, "yyyy年M月", { locale: ja })}</div>
                            </div>
                        </CardContent>
                    </Card>

                    <StudentAvailabilityCard
                        studentId={student.id}
                        year={year}
                        month={month}
                        initialData={availability}
                        workingHours={workingHours}
                    />
                </div>
            </div>
        </div>
    )
}
