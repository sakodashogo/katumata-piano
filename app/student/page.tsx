import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CalendarDays, Clock, Plus } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"

async function getStudentLessons(studentId: string) {
    return await prisma.lesson.findMany({
        where: { studentId },
        orderBy: { startTime: "asc" },
        include: { teacher: true },
    })
}

export default async function StudentDashboard() {
    const session = await auth()
    if (!session?.user) return null

    const lessons = await getStudentLessons(session.user.id!)
    const nextLesson = lessons.find(l => new Date(l.startTime) > new Date())

    return (
        <div className="space-y-8">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Welcome, {session.user.name}</h1>
                    <p className="text-slate-500">Track your progress and schedule lessons.</p>
                </div>
                <Link href="/student/book">
                    <Button size="lg" className="shadow-xl shadow-blue-500/20">
                        <Plus className="mr-2 h-5 w-5" /> Book Lesson
                    </Button>
                </Link>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Next Lesson Card */}
                <Card className="md:col-span-2 border-l-4 border-l-blue-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-blue-500" />
                            Next Lesson
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {nextLesson ? (
                            <div className="space-y-4">
                                <div className="flex flex-col md:flex-row md:items-center gap-4 text-slate-700">
                                    <div className="text-4xl font-bold tracking-tight">
                                        {format(new Date(nextLesson.startTime), "MMMM d")}
                                    </div>
                                    <div className="flex items-center gap-2 text-xl text-slate-500">
                                        <Clock className="h-5 w-5" />
                                        {format(new Date(nextLesson.startTime), "h:mm a")} - {format(new Date(nextLesson.endTime), "h:mm a")}
                                    </div>
                                </div>
                                <div className="text-sm text-slate-500">
                                    Teacher: {nextLesson.teacher.name || "Assigned Teacher"}
                                </div>
                            </div>
                        ) : (
                            <div className="py-6 text-center text-slate-500">
                                No upcoming lessons scheduled.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Stats or Info */}
                <Card>
                    <CardHeader>
                        <CardTitle>My Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-4">
                            <div className="text-3xl font-bold text-slate-900">{lessons.length}</div>
                            <div className="text-xs uppercase text-slate-500 font-medium">Total Lessons</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Upcoming Lessons List */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">Upcoming Schedule</h2>
                {lessons.length > 0 ? (
                    <div className="rounded-xl border bg-white divide-y">
                        {lessons.map((lesson) => (
                            <div key={lesson.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="bg-slate-100 p-2 rounded-lg text-center min-w-[60px]">
                                        <div className="text-xs uppercase text-slate-500 font-bold">{format(new Date(lesson.startTime), "MMM")}</div>
                                        <div className="text-xl font-bold text-slate-900">{format(new Date(lesson.startTime), "d")}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-900">{lesson.type || "Regular Lesson"}</div>
                                        <div className="text-sm text-slate-500">
                                            {format(new Date(lesson.startTime), "h:mm a")} - {format(new Date(lesson.endTime), "h:mm a")}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                                    Confirmed
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-slate-500">You haven't booked any lessons yet.</p>
                )}
            </div>
        </div>
    )
}
