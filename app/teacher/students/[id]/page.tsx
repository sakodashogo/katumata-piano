import { prisma } from "@/lib/prisma"
import { getStudentHistory } from "@/app/lib/actions/lesson"
import { LessonReportDialog } from "@/components/teacher/LessonReportDialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
    const student = await prisma.user.findUnique({
        where: { id: params.id }
    })

    if (!student) return <div>Student not found</div>

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
                        <CardTitle>Lesson History</CardTitle>
                        <CardDescription>Past lessons and reports.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {lessons?.map((lesson) => (
                                <div key={lesson.id} className="border rounded-lg p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-semibold">
                                                {format(lesson.startTime, "MMMM d, yyyy")}
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                {format(lesson.startTime, "HH:mm")} - {format(lesson.endTime, "HH:mm")}
                                            </div>
                                        </div>
                                        <Badge variant={lesson.status === "COMPLETED" ? "default" : "secondary"}>
                                            {lesson.status}
                                        </Badge>
                                    </div>

                                    {(lesson.report || lesson.homework) && (
                                        <div className="bg-slate-50 p-3 rounded text-sm space-y-2">
                                            {lesson.report && (
                                                <div>
                                                    <span className="font-semibold text-slate-700">Note: </span>
                                                    {lesson.report}
                                                </div>
                                            )}
                                            {lesson.homework && (
                                                <div>
                                                    <span className="font-semibold text-slate-700">Homework: </span>
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
                                    No lesson history found.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <div className="text-sm font-medium text-slate-500">Email</div>
                            <div>{student.email}</div>
                        </div>
                        <div>
                            <div className="text-sm font-medium text-slate-500">Joined</div>
                            <div>{format(student.createdAt, "MMMM yyyy")}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
