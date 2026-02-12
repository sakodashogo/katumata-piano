"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format, addMonths, subMonths } from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronLeft, ChevronRight, CalendarCheck } from "lucide-react"
import { SchedulingCalendar } from "@/components/teacher/SchedulingCalendar"
import { bulkCreateLessons } from "@/app/lib/actions/planning"
import { useToast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { HeatmapScheduler } from "@/components/teacher/HeatmapScheduler"
import { generateSuggestedSchedule, ScheduleSuggestion } from "@/app/lib/actions/schedule-maker"
import { Wand2 } from "lucide-react"

type Student = {
    id: string
    name: string | null
    email: string
    availability: {
        availableSlots: any
        unavailableSlots: any
    } | null
}

type Lesson = {
    id: string
    startTime: string | Date
    endTime: string | Date
    studentId: string
}

type Props = {
    students: Student[]
    lessons: Lesson[]
    year: number
    month: number
}

export function MonthlyScheduler({ students, lessons, year, month }: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<"list" | "heatmap">("list")
    const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([])
    const [isGenerating, setIsGenerating] = useState(false)

    // Derived state
    const selectedStudent = students.find(s => s.id === selectedStudentId)

    const handleMonthChange = (offset: number) => {
        const d = addMonths(new Date(year, month - 1), offset)
        const params = new URLSearchParams()
        params.set("year", d.getFullYear().toString())
        params.set("month", (d.getMonth() + 1).toString())
        router.push(`/teacher/schedule/monthly?${params.toString()}`)
    }

    const handleCreateLessons = async (newLessons: { startTime: Date, endTime: Date }[]) => {
        if (!selectedStudentId) return false

        const drafts = newLessons.map(l => ({
            studentId: selectedStudentId,
            startTime: l.startTime,
            endTime: l.endTime,
            roomId: "A", // Default to A for now
            type: "REGULAR" as const
        })) // Cast to verify with LessonDraft

        const result = await bulkCreateLessons(drafts)
        if (result.success) {
            toast.success(`${drafts.length}件のレッスンを追加しました。`)
            router.refresh()
            return true
        } else {
            toast.error("作成に失敗しました。")
            return false
        }
    }

    const getStudentLessonCount = (studentId: string) => {
        return lessons.filter(l => l.studentId === studentId).length
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
                toast.error("提案の作成に失敗しました。")
            }
        } catch (error) {
            toast.error("エラーが発生しました。")
        } finally {
            setIsGenerating(false)
        }
    }

    const handleConfirmSuggestions = async (selectedSuggestions: ScheduleSuggestion[]) => {
        const drafts = selectedSuggestions.map(s => ({
            studentId: s.studentId,
            startTime: s.slot.startTime,
            endTime: s.slot.endTime,
            roomId: "A", // Default
            type: "REGULAR" as const
        }))

        const result = await bulkCreateLessons(drafts)
        if (result.success) {
            toast.success(`${drafts.length}件のレッスンを一括作成しました。`)
            setViewMode("list")
            router.refresh()
        } else {
            toast.error("作成に失敗しました。")
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => handleMonthChange(-1)}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    前月
                </Button>
                <h2 className="text-xl font-bold">
                    {year}年 {month}月
                </h2>
                <Button variant="outline" onClick={() => handleMonthChange(1)}>
                    次月
                    <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>

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
                                    <TableHead>予約数</TableHead>
                                    <TableHead className="text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((student) => {
                                    const hasAvailability = !!student.availability
                                    const lessonCount = getStudentLessonCount(student.id)

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
                                                    {lessonCount}回
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    onClick={() => setSelectedStudentId(student.id)}
                                                >
                                                    <CalendarCheck className="mr-2 h-4 w-4" />
                                                    スケジュール
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
                    existingLessons={lessons.filter(l => l.studentId === selectedStudentId)}
                    year={year}
                    month={month}
                    onSave={handleCreateLessons}
                    isOpen={!!selectedStudentId}
                    onClose={() => setSelectedStudentId(null)}
                />
            )}
        </div>
    )
}
