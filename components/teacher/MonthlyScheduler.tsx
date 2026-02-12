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

    const handleSaveStudentLessons = async (newLessons: Array<{ startTime: Date; endTime: Date }>) => {
        if (!selectedStudentId) return false

        const result = await replaceStudentMonthlyLessons({
            studentId: selectedStudentId,
            year,
            month,
            lessons: newLessons.map((lesson) => ({
                startTime: lesson.startTime,
                endTime: lesson.endTime,
                roomId: "A",
            })),
        })

        if (result.success) {
            toast.success(`${selectedStudent?.name || "生徒"}の月間予定を下書き保存しました。`)
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
            roomId: "A",
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
                    生徒ごとに下書き保存し、最後に月単位で公開します。公開後も再編集して再反映できます。
                </p>
            </div>

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
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    onClick={() => setSelectedStudentId(student.id)}
                                                >
                                                    <CalendarCheck className="mr-2 h-4 w-4" />
                                                    予定を編集
                                                </Button>
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
                    studentName={selectedStudent.name || "生徒"}
                    availableSlots={Array.isArray(selectedStudent.availability?.availableSlots) ? selectedStudent.availability!.availableSlots.map(String) : []}
                    unavailableSlots={Array.isArray(selectedStudent.availability?.unavailableSlots) ? selectedStudent.availability!.unavailableSlots.map(String) : []}
                    existingLessons={lessons
                        .filter((lesson) => {
                            if (lesson.studentId === selectedStudentId) return true
                            const room = lesson.roomId || "A"
                            return room === "A"
                        })
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
