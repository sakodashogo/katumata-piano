import { prisma } from "@/lib/prisma"
import { getStudentHistory } from "@/app/lib/actions/lesson"
import { LessonReportDialog } from "@/components/teacher/LessonReportDialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { LESSON_STATUS_LABELS } from "@/lib/constants"

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
    const student = await prisma.user.findUnique({
        where: { id: params.id }
    })

    if (!student) return <div>生徒が見つかりません</div>

    const { data: lessons } = await getStudentHistory(params.id)

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

                <Card>
                    <CardHeader>
                        <CardTitle>プロフィール</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <div className="text-sm font-medium text-slate-500">メール</div>
                            <div>{student.email}</div>
                        </div>
                        <div>
                            <div className="text-sm font-medium text-slate-500">登録日</div>
                            <div>{format(student.createdAt, "yyyy年M月", { locale: ja })}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
