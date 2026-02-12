"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { addMonths, format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, CalendarCheck, Wand2 } from "lucide-react"
import { SchedulingCalendar } from "@/components/teacher/SchedulingCalendar"
import {
    appendStudentMonthlyLesson,
    bulkCreateLessons,
    publishMonthlySchedule,
    replaceStudentMonthlyLessons,
} from "@/app/lib/actions/planning"
import { generateSuggestedSchedule, ScheduleSuggestion } from "@/app/lib/actions/schedule-maker"
import { useToast } from "@/components/ui/toast"
import { HeatmapScheduler } from "@/components/teacher/HeatmapScheduler"

type Student = {
    id: string
    name: string | null
    email: string
    defaultLessonCount: number
    availability: {
        availableSlots: unknown
        unavailableSlots: unknown
    } | null
}

type Lesson = {
    id: string
    startTime: string | Date
    endTime: string | Date
    studentId: string
    roomId: string | null
    status: string
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
}

type Props = {
    students: Student[]
    lessons: Lesson[]
    year: number
    month: number
    isPublished?: boolean
    publishedAt?: string | Date | null
}

export function MonthlyScheduler({
    students,
    lessons,
    year,
    month,
    isPublished = false,
    publishedAt = null,
}: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<"list" | "heatmap">("list")
    const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [isPublishingMonth, setIsPublishingMonth] = useState(false)
    const [manualStudentId, setManualStudentId] = useState(students[0]?.id ?? "")
    const [manualDate, setManualDate] = useState("")
    const [manualTime, setManualTime] = useState("14:00")
    const [manualDuration, setManualDuration] = useState(30)
    const [manualRoomId, setManualRoomId] = useState<"A" | "B">("A")
    const [manualType, setManualType] = useState<"REGULAR" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL">("REGULAR")
    const [isAppending, setIsAppending] = useState(false)

    const selectedStudent = students.find((student) => student.id === selectedStudentId)

    const draftLessons = useMemo(
        () => lessons.filter((lesson) => lesson.status === "DRAFT"),
        [lessons]
    )

    const getStudentLessonCount = (studentId: string) =>
        lessons.filter((lesson) => lesson.studentId === studentId).length

    const handleMonthChange = (offset: number) => {
        const d = addMonths(new Date(year, month - 1), offset)
        const params = new URLSearchParams()
        params.set("year", d.getFullYear().toString())
        params.set("month", (d.getMonth() + 1).toString())
        router.push(`/teacher/schedule/monthly?${params.toString()}`)
    }

    const handleSaveStudentLessons = async (newLessons: Array<{
        startTime: Date
        endTime: Date
        roomId: string
        type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
    }>) => {
        if (!selectedStudentId) return false

        const result = await replaceStudentMonthlyLessons({
            studentId: selectedStudentId,
            year,
            month,
            lessons: newLessons,
        })

        if (result.success) {
            toast.success(`${selectedStudent?.name || "生徒"}の月間予定を保存しました。`)
            router.refresh()
            return true
        }

        toast.error(result.error || "保存に失敗しました。")
        return false
    }

    const handleAutoSchedule = async () => {
        setIsGenerating(true)
        try {
            const result = await generateSuggestedSchedule(year, month)
            if (result.success && result.suggestions) {
                setSuggestions(result.suggestions)
                setViewMode("heatmap")
                toast.success(`${result.suggestions.length}件の提案を作成しました。`)
            } else {
                toast.error(result.error || "提案の作成に失敗しました。")
            }
        } catch {
            toast.error("エラーが発生しました。")
        } finally {
            setIsGenerating(false)
        }
    }

    const handleConfirmSuggestions = async (selectedSuggestions: ScheduleSuggestion[]) => {
        const drafts = selectedSuggestions.map((suggestion) => ({
            studentId: suggestion.studentId,
            startTime: suggestion.slot.startTime,
            endTime: suggestion.slot.endTime,
            roomId: suggestion.slot.roomId,
            type: "REGULAR" as const,
            status: "DRAFT" as const,
        }))

        const result = await bulkCreateLessons(drafts)
        if (result.success) {
            toast.success(`${drafts.length}件の提案を下書き保存しました。`)
            setViewMode("list")
            router.refresh()
        } else {
            toast.error(result.error || "作成に失敗しました。")
        }
    }

    const handleAppendManualLesson = async () => {
        if (!manualStudentId || !manualDate || !manualTime) {
            toast.error("生徒・日付・時間を入力してください。")
            return
        }

        setIsAppending(true)
        const [hour, minute] = manualTime.split(":").map(Number)
        const start = new Date(`${manualDate}T00:00:00`)
        start.setHours(hour, minute, 0, 0)
        const end = new Date(start.getTime() + manualDuration * 60 * 1000)

        const result = await appendStudentMonthlyLesson({
            studentId: manualStudentId,
            startTime: start,
            endTime: end,
            roomId: manualRoomId,
            type: manualType,
            status: isPublished ? "BOOKED" : "DRAFT",
        })
        setIsAppending(false)

        if (!result.success) {
            toast.error(result.error || "手動追加に失敗しました。")
            return
        }
        toast.success("手動で予定を追加しました。")
        router.refresh()
    }

    const handleClearStudentLessons = async (studentId: string, studentName?: string | null) => {
        const result = await replaceStudentMonthlyLessons({
            studentId,
            year,
            month,
            lessons: [],
        })
        if (!result.success) {
            toast.error(result.error || "予定のクリアに失敗しました。")
            return
        }
        toast.success(`${studentName || "生徒"}の予定をクリアしました。`)
        router.refresh()
    }

    const handlePublishMonth = async () => {
        setIsPublishingMonth(true)
        const result = await publishMonthlySchedule(year, month)
        if (result.success) {
            if (result.alreadyPublished) {
                toast.info(`${year}年${month}月は確定済みでした。下書き変更分を再反映しました。`)
            } else {
                toast.success(`${year}年${month}月の下書きを公開しました。`)
            }
            router.refresh()
        } else {
            toast.error(result.error || "月間スケジュールの公開に失敗しました。")
        }
        setIsPublishingMonth(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => handleMonthChange(-1)}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    前月
                </Button>
                <h2 className="text-xl font-bold">{year}年 {month}月</h2>
                <Button variant="outline" onClick={() => handleMonthChange(1)}>
                    次月
                    <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>

            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">
                        下書き {draftLessons.length}件
                    </Badge>
                    <Badge variant="outline">
                        公開済み {lessons.filter((lesson) => lesson.status === "BOOKED").length}件
                    </Badge>
                    {isPublished && (
                        <Badge variant="secondary">
                            公開済み {publishedAt ? format(new Date(publishedAt), "yyyy/MM/dd HH:mm") : ""}
                        </Badge>
                    )}
                </div>
                <p>
                    生徒ごとに下書き保存し、最後に月単位で公開します。既存予定は自動提案時に固定枠として扱われます。
                </p>
            </div>

            <Card>
                <CardContent className="space-y-3 p-4">
                    <div className="text-sm font-semibold text-slate-800">全生徒一括調整（手動追加）</div>
                    <div className="grid gap-2 md:grid-cols-7">
                        <select
                            value={manualStudentId}
                            onChange={(e) => setManualStudentId(e.target.value)}
                            className="h-9 rounded border px-2 text-sm"
                        >
                            {students.map((student) => (
                                <option key={student.id} value={student.id}>
                                    {student.name || student.email}
                                </option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={manualDate}
                            onChange={(e) => setManualDate(e.target.value)}
                            className="h-9 rounded border px-2 text-sm"
                        />
                        <input
                            type="time"
                            value={manualTime}
                            onChange={(e) => setManualTime(e.target.value)}
                            className="h-9 rounded border px-2 text-sm"
                        />
                        <select
                            value={String(manualDuration)}
                            onChange={(e) => setManualDuration(Number(e.target.value))}
                            className="h-9 rounded border px-2 text-sm"
                        >
                            <option value="30">30分</option>
                            <option value="45">45分</option>
                            <option value="60">60分</option>
                        </select>
                        <select
                            value={manualRoomId}
                            onChange={(e) => setManualRoomId(e.target.value === "B" ? "B" : "A")}
                            className="h-9 rounded border px-2 text-sm"
                        >
                            <option value="A">第1レッスン室</option>
                            <option value="B">第2レッスン室</option>
                        </select>
                        <select
                            value={manualType}
                            onChange={(e) => setManualType(e.target.value as "REGULAR" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL")}
                            className="h-9 rounded border px-2 text-sm"
                        >
                            <option value="REGULAR">通常</option>
                            <option value="PRACTICE">自主練</option>
                            <option value="SOLO_ADDITIONAL">ソロ</option>
                            <option value="DUET_ADDITIONAL">連弾</option>
                        </select>
                        <Button onClick={handleAppendManualLesson} disabled={isAppending}>
                            {isAppending ? "追加中..." : "手動追加"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
                <Button
                    onClick={handlePublishMonth}
                    disabled={isPublishingMonth || draftLessons.length === 0}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                    {isPublishingMonth ? "公開中..." : "下書きを公開"}
                </Button>

                <div className="flex justify-end">
                    {viewMode === "list" && (
                        <Button onClick={handleAutoSchedule} disabled={isGenerating}>
                            <Wand2 className="mr-2 h-4 w-4" />
                            {isGenerating ? "生成中..." : "自動割り当て提案"}
                        </Button>
                    )}
                    {viewMode === "heatmap" && (
                        <Button variant="outline" onClick={() => setViewMode("list")}>
                            リストに戻る
                        </Button>
                    )}
                </div>
            </div>

            {viewMode === "heatmap" ? (
                <HeatmapScheduler
                    suggestions={suggestions}
                    students={students}
                    year={year}
                    month={month}
                    onConfirm={handleConfirmSuggestions}
                    onCancel={() => setViewMode("list")}
                />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>生徒名</TableHead>
                                    <TableHead>希望提出</TableHead>
                                    <TableHead>予定数 / 契約</TableHead>
                                    <TableHead>不足回数</TableHead>
                                    <TableHead>既存予定</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((student) => {
                                    const hasAvailability = !!student.availability
                                    const lessonCount = getStudentLessonCount(student.id)
                                    const remainingCount = Math.max(student.defaultLessonCount - lessonCount, 0)

                                    return (
                                        <TableRow key={student.id}>
                                            <TableCell className="font-medium">{student.name}</TableCell>
                                            <TableCell>
                                                {hasAvailability ? (
                                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                                        提出済
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={lessonCount > 0 ? "secondary" : "outline"}>
                                                    {lessonCount} / {student.defaultLessonCount}回
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={remainingCount > 0 ? "outline" : "secondary"}
                                                    className={remainingCount > 0 ? "text-amber-700 border-amber-200 bg-amber-50" : ""}
                                                >
                                                    {remainingCount}回
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-[360px]">
                                                <div className="flex flex-wrap gap-1">
                                                    {lessons
                                                        .filter((lesson) => lesson.studentId === student.id)
                                                        .slice(0, 6)
                                                        .map((lesson) => (
                                                            <Badge key={lesson.id} variant="outline" className="text-[10px]">
                                                                {format(new Date(lesson.startTime), "M/d HH:mm")} {lesson.roomId || "A"}
                                                            </Badge>
                                                        ))}
                                                    {lessons.filter((lesson) => lesson.studentId === student.id).length > 6 && (
                                                        <Badge variant="outline" className="text-[10px]">
                                                            +{lessons.filter((lesson) => lesson.studentId === student.id).length - 6}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleClearStudentLessons(student.id, student.name)}
                                                    >
                                                        予定を全削除
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setSelectedStudentId(student.id)}
                                                    >
                                                        <CalendarCheck className="mr-2 h-4 w-4" />
                                                        予定を編集
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {selectedStudent && (
                <SchedulingCalendar
                    studentId={selectedStudent.id}
                    studentName={selectedStudent.name || "生徒"}
                    availableSlots={Array.isArray(selectedStudent.availability?.availableSlots) ? selectedStudent.availability!.availableSlots.map(String) : []}
                    unavailableSlots={Array.isArray(selectedStudent.availability?.unavailableSlots) ? selectedStudent.availability!.unavailableSlots.map(String) : []}
                    existingLessons={lessons
                        .filter((lesson) => !!lesson)
                        .map((lesson) => ({
                            ...lesson,
                            isEditable: lesson.studentId === selectedStudentId,
                        }))}
                    year={year}
                    month={month}
                    onSave={handleSaveStudentLessons}
                    isOpen={!!selectedStudentId}
                    onClose={() => setSelectedStudentId(null)}
                />
            )}
        </div>
    )
}
