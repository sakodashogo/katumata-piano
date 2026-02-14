
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/prisma"
import { getCachedSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, addWeeks } from "date-fns"
import { ja } from "date-fns/locale"
import { LESSON_TYPE_LABELS, LESSON_STATUS_LABELS } from "@/lib/constants"
import { CalendarDays, Users, Clock, BookOpen, CalendarCheck, ListChecks, Monitor, ClipboardList, UserRoundCog, CalendarOff } from "lucide-react"
import Link from "next/link"
import { unstable_cache } from "next/cache"

const getTeacherDashboardData = unstable_cache(
    async () => {
        const now = new Date()
        const todayStart = startOfDay(now)
        const todayEnd = endOfDay(now)
        const weekStart = startOfWeek(now, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
        const nextWeekEnd = addWeeks(weekEnd, 1)

        const [todayLessons, weekOpenSlots, upcomingLessons, totalStudents] = await Promise.all([
            prisma.lesson.findMany({
                where: {
                    startTime: { gte: todayStart, lte: todayEnd },
                    status: { not: "CANCELLED" },
                },
                include: { student: { select: { name: true } } },
                orderBy: { startTime: "asc" },
            }),
            prisma.openSlot.count({
                where: {
                    startTime: { gte: weekStart, lte: weekEnd },
                    isBooked: false,
                },
            }),
            prisma.lesson.findMany({
                where: {
                    startTime: { gt: todayEnd, lte: nextWeekEnd },
                    status: "BOOKED",
                },
                include: { student: { select: { name: true } } },
                orderBy: { startTime: "asc" },
                take: 10,
            }),
            prisma.user.count({
                where: { role: "STUDENT" },
            }),
        ])

        return { todayLessons, weekOpenSlots, upcomingLessons, totalStudents }
    },
    ["teacher-dashboard"],
    { revalidate: 30 }
)

export default async function TeacherDashboard() {
    const session = await getCachedSession()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const now = new Date()
    const { todayLessons, weekOpenSlots, upcomingLessons, totalStudents } = await getTeacherDashboardData()

    return (
        <main className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">講師ダッシュボード</h1>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-blue-100 p-2">
                                <CalendarDays className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">本日のレッスン</p>
                                <p className="text-2xl font-bold">{todayLessons.length}件</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-green-100 p-2">
                                <Clock className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">今週の空き枠</p>
                                <p className="text-2xl font-bold">{weekOpenSlots}枠</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-purple-100 p-2">
                                <Users className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">生徒数</p>
                                <p className="text-2xl font-bold">{totalStudents}人</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-amber-100 p-2">
                                <BookOpen className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">今後の予約</p>
                                <p className="text-2xl font-bold">{upcomingLessons.length}件</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Today's Schedule */}
                <Card>
                    <CardHeader>
                        <CardTitle>本日のスケジュール</CardTitle>
                        <CardDescription>{format(now, "yyyy年M月d日 (E)", { locale: ja })}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {todayLessons.length > 0 ? (
                            <div className="space-y-3">
                                {todayLessons.map((lesson) => (
                                    <div key={lesson.id} className="flex items-center justify-between border rounded-lg p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="text-sm font-mono font-medium text-slate-700">
                                                {format(lesson.startTime, "HH:mm")}
                                            </div>
                                            <div>
                                                <div className="font-medium">{lesson.student.name}</div>
                                                <div className="text-xs text-slate-500">
                                                    {LESSON_TYPE_LABELS[lesson.type] || lesson.type}
                                                </div>
                                            </div>
                                        </div>
                                        <Badge variant={lesson.status === "COMPLETED" ? "default" : "secondary"}>
                                            {LESSON_STATUS_LABELS[lesson.status] || lesson.status}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500 text-center py-6">本日のレッスンはありません。</p>
                        )}
                    </CardContent>
                </Card>

                {/* Upcoming Lessons */}
                <Card>
                    <CardHeader>
                        <CardTitle>今後の予約</CardTitle>
                        <CardDescription>直近1週間の予定</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {upcomingLessons.length > 0 ? (
                            <div className="space-y-3">
                                {upcomingLessons.map((lesson) => (
                                    <div key={lesson.id} className="flex items-center justify-between border rounded-lg p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="text-sm font-mono text-slate-500">
                                                {format(lesson.startTime, "M/d (E)", { locale: ja })}
                                                <br />
                                                {format(lesson.startTime, "HH:mm")}
                                            </div>
                                            <div>
                                                <div className="font-medium">{lesson.student.name}</div>
                                                <div className="text-xs text-slate-500">
                                                    {LESSON_TYPE_LABELS[lesson.type] || lesson.type}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500 text-center py-6">今後の予約はありません。</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <Link href="/teacher/schedule" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <CalendarDays className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                            <p className="font-medium">週次スケジュール</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/teacher/slots" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <ListChecks className="h-8 w-8 mx-auto mb-2 text-indigo-600" />
                            <p className="font-medium">空き枠承認</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/teacher/resources" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <Monitor className="h-8 w-8 mx-auto mb-2 text-cyan-600" />
                            <p className="font-medium">リソース可視化</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/teacher/support" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <UserRoundCog className="h-8 w-8 mx-auto mb-2 text-sky-600" />
                            <p className="font-medium">サポート講師シフト</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/teacher/availabilities" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <ClipboardList className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
                            <p className="font-medium">生徒の希望</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/teacher/schedule/monthly" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <CalendarCheck className="h-8 w-8 mx-auto mb-2 text-green-600" />
                            <p className="font-medium">月間スケジュール</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/teacher/students" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <Users className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                            <p className="font-medium">生徒管理</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/teacher/closed-days" prefetch={false} className="block">
                    <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                        <CardContent className="pt-6 text-center">
                            <CalendarOff className="h-8 w-8 mx-auto mb-2 text-rose-600" />
                            <p className="font-medium">お休み設定</p>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </main>

    )
}
