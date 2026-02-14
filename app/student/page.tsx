import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays, Clock, Plus } from "lucide-react"
import Link from "next/link"
import { endOfMonth, format, startOfMonth } from "date-fns"
import { ja } from "date-fns/locale"
import { LESSON_TYPE_LABELS } from "@/lib/constants"
import { StudentScheduleCalendar } from "@/components/student/StudentScheduleCalendar"
import { getCachedSession } from "@/lib/session"
import { unstable_cache } from "next/cache"

const getStudentDashboardData = unstable_cache(
    async (studentId: string) => {
        const now = new Date()
        const currentMonthStart = startOfMonth(now)
        const currentMonthEnd = endOfMonth(now)
        const monthRegularRangeStart = now > currentMonthStart ? now : currentMonthStart

        const [upcomingLessons, historyLessons, monthlyRegularLessons] = await Promise.all([
            prisma.lesson.findMany({
                where: {
                    studentId,
                    status: "BOOKED",
                    startTime: { gt: now },
                },
                select: {
                    id: true,
                    startTime: true,
                    endTime: true,
                    type: true,
                    status: true,
                    menuId: true,
                    teacher: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: { startTime: "asc" },
            }),
            prisma.lesson.findMany({
                where: {
                    studentId,
                    status: { not: "DRAFT" },
                    startTime: { lte: now },
                },
                select: {
                    id: true,
                    startTime: true,
                    endTime: true,
                    type: true,
                    status: true,
                    report: true,
                    homework: true,
                },
                orderBy: { startTime: "desc" },
            }),
            prisma.lesson.findMany({
                where: {
                    studentId,
                    status: "BOOKED",
                    type: "REGULAR",
                    startTime: {
                        gte: monthRegularRangeStart,
                        lte: currentMonthEnd,
                    },
                },
                select: {
                    id: true,
                    startTime: true,
                    endTime: true,
                },
                orderBy: { startTime: "asc" },
            }),
        ])

        return {
            upcomingLessons,
            historyLessons,
            monthlyRegularLessons,
        }
    },
    ["student-dashboard"],
    { revalidate: 30 }
)

export default async function StudentDashboard() {
    const session = await getCachedSession()
    if (!session?.user?.id) return null

    const { upcomingLessons, historyLessons, monthlyRegularLessons } = await getStudentDashboardData(session.user.id)
    const upcomingRegular = upcomingLessons.filter((lesson) => lesson.type === "REGULAR")
    const upcomingAdditional = upcomingLessons.filter((lesson) =>
        lesson.type === "AD_HOC" || lesson.type === "SOLO_ADDITIONAL" || lesson.type === "DUET_ADDITIONAL"
    )

    const nextLesson = upcomingLessons[0]

    return (
        <div className="space-y-8">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">こんにちは、{session.user.name} さん</h1>
                    <p className="text-slate-500">レッスンの予約・確認ができます。</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/student/availability" prefetch={false}>
                        <Button variant="outline" size="lg">
                            空き状況を登録
                        </Button>
                    </Link>
                    <Link href="/student/book" prefetch={false}>
                        <Button size="lg" className="shadow-xl shadow-blue-500/20">
                            <Plus className="mr-2 h-5 w-5" /> レッスン予約
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Next Lesson Card */}
                <Card className="md:col-span-2 border-l-4 border-l-blue-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-blue-500" />
                            次のレッスン
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {nextLesson ? (
                            <div className="space-y-4">
                                <div className="flex flex-col md:flex-row md:items-center gap-4 text-slate-700">
                                    <div className="text-4xl font-bold tracking-tight">
                                        {format(new Date(nextLesson.startTime), "M月d日 (E)", { locale: ja })}
                                    </div>
                                    <div className="flex items-center gap-2 text-xl text-slate-500">
                                        <Clock className="h-5 w-5" />
                                        {format(new Date(nextLesson.startTime), "HH:mm")} - {format(new Date(nextLesson.endTime), "HH:mm")}
                                    </div>
                                </div>
                                <div className="text-sm text-slate-500">
                                    講師: {nextLesson.teacher?.name || "担当講師"}
                                </div>
                                <div className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                                    {LESSON_TYPE_LABELS[nextLesson.type] || "レッスン"}
                                </div>
                            </div>
                        ) : (
                            <div className="py-6 text-center text-slate-500">
                                予約中のレッスンはありません。
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card>
                    <CardHeader>
                        <CardTitle>レッスン実績</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-4">
                            <div className="text-3xl font-bold text-slate-900">{historyLessons.length}</div>
                            <div className="text-xs uppercase text-slate-500 font-medium">受講済みレッスン</div>
                        </div>
                        <div className="space-y-1 text-xs text-slate-600">
                            <div>次回の固定: {upcomingRegular.length}件</div>
                            <div>次回の追加: {upcomingAdditional.length}件</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>今月の固定レッスン</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {monthlyRegularLessons.length === 0 ? (
                            <p className="text-sm text-slate-500">今月の固定レッスンはまだありません。</p>
                        ) : (
                            monthlyRegularLessons.map((lesson) => (
                                <div key={lesson.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                                    <div className="text-sm font-medium text-slate-800">
                                        {format(new Date(lesson.startTime), "M/d (E) HH:mm", { locale: ja })}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {format(new Date(lesson.endTime), "HH:mm")}まで
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>予約・変更ショートカット</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-slate-500">
                            追加予約や空き状況更新はここからすぐに操作できます。日時変更・キャンセルはカレンダー内の各レッスンから行えます。
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Link href="/student/book" prefetch={false}>
                                <Button>
                                    <Plus className="mr-2 h-4 w-4" />
                                    追加予約
                                </Button>
                            </Link>
                            <Link href="/student/availability" prefetch={false}>
                                <Button variant="outline">
                                    空き状況を更新
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <StudentScheduleCalendar
                lessons={upcomingLessons.map((lesson) => ({
                    id: lesson.id,
                    startTime: lesson.startTime.toISOString(),
                    endTime: lesson.endTime.toISOString(),
                    type: lesson.type,
                    status: lesson.status,
                    menuId: lesson.menuId,
                }))}
            />

            {/* Lesson History List */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">レッスン履歴</h2>
                {historyLessons.length > 0 ? (
                    <div className="rounded-xl border bg-white divide-y">
                        {historyLessons.map((lesson) => (
                            <div key={lesson.id} className="p-4 hover:bg-slate-50 transition-colors space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-slate-50 p-2 rounded-lg text-center min-w-[60px] opacity-70">
                                            <div className="text-xs text-slate-500 font-bold">{format(new Date(lesson.startTime), "M月", { locale: ja })}</div>
                                            <div className="text-xl font-bold text-slate-500">{format(new Date(lesson.startTime), "d")}</div>
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-700">{LESSON_TYPE_LABELS[lesson.type] || "レッスン"}</div>
                                            <div className="text-sm text-slate-400">
                                                {format(new Date(lesson.startTime), "HH:mm")} - {format(new Date(lesson.endTime), "HH:mm")}
                                            </div>
                                        </div>
                                    </div>
                                    {(lesson.report || lesson.homework) && (
                                        <div className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                                            レポートあり
                                        </div>
                                    )}
                                </div>

                                {(lesson.report || lesson.homework) && (
                                    <div className="ml-[76px] bg-slate-50 p-3 rounded text-sm space-y-2 border border-slate-100">
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
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-slate-500">レッスン履歴はありません。</p>
                )}
            </div>
        </div>
    )
}
