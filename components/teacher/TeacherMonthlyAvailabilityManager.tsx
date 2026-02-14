"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import { CheckCircle2, Clock3 } from "lucide-react"
import { AvailabilityCalendar } from "@/components/availability/AvailabilityCalendar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import { saveMonthlyAvailability } from "@/app/lib/actions/availability"
import { type TeacherWorkingHoursByDay } from "@/lib/teacher-working-hours"
import { type ClosedDayRecord } from "@/lib/closed-days"

type AvailabilityRecord = {
    availableSlots: unknown
    unavailableSlots: unknown
    updatedAt: Date | string
} | null

type StudentItem = {
    id: string
    name: string | null
    email: string
    availability: AvailabilityRecord
}

type Props = {
    year: number
    month: number
    students: StudentItem[]
    initialStudentId: string | null
    workingHours: TeacherWorkingHoursByDay
    closedDays: ClosedDayRecord[]
}

export function TeacherMonthlyAvailabilityManager({
    year,
    month,
    students,
    initialStudentId,
    workingHours,
    closedDays,
}: Props) {
    const router = useRouter()
    const { toast } = useToast()
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initialStudentId)

    const selectedStudent = useMemo(
        () => students.find((student) => student.id === selectedStudentId) ?? null,
        [selectedStudentId, students]
    )

    const availableSlots = useMemo(() => {
        if (!selectedStudent?.availability) return []
        return Array.isArray(selectedStudent.availability.availableSlots)
            ? selectedStudent.availability.availableSlots.map(String)
            : []
    }, [selectedStudent])

    const unavailableSlots = useMemo(() => {
        if (!selectedStudent?.availability) return []
        return Array.isArray(selectedStudent.availability.unavailableSlots)
            ? selectedStudent.availability.unavailableSlots.map(String)
            : []
    }, [selectedStudent])

    const submittedCount = useMemo(
        () => students.filter((student) => !!student.availability).length,
        [students]
    )

    const handleSave = async (targetYear: number, targetMonth: number, data: { availableSlots: string[]; unavailableSlots: string[] }) => {
        if (!selectedStudentId) {
            return { success: false, error: "生徒を選択してください。" }
        }
        const result = await saveMonthlyAvailability(selectedStudentId, targetYear, targetMonth, data)
        if (result.success) {
            toast.success("希望時間を保存しました。")
            router.refresh()
            return { success: true }
        }
        toast.error(result.error || "保存に失敗しました。")
        return { success: false, error: result.error }
    }

    const handleMonthChange = (targetYear: number, targetMonth: number) => {
        const query = new URLSearchParams({
            year: String(targetYear),
            month: String(targetMonth),
        })
        if (selectedStudentId) {
            query.set("student", selectedStudentId)
        }
        router.push(`/teacher/availabilities?${query.toString()}`)
    }

    return (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
            <aside className="rounded-xl border bg-white shadow-sm">
                <div className="border-b p-4">
                    <h2 className="text-base font-bold text-slate-900">{year}年{month}月 提出状況</h2>
                    <p className="mt-1 text-xs text-slate-500">提出済み {submittedCount} / {students.length} 人</p>
                </div>
                <div className="max-h-[720px] overflow-auto p-3">
                    <div className="space-y-2">
                        {students.map((student) => {
                            const isSelected = student.id === selectedStudentId
                            const isSubmitted = !!student.availability
                            return (
                                <button
                                    key={student.id}
                                    className={cn(
                                        "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                                        isSelected
                                            ? "border-blue-300 bg-blue-50"
                                            : "border-slate-200 bg-white hover:bg-slate-50"
                                    )}
                                    onClick={() => setSelectedStudentId(student.id)}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-sm font-semibold text-slate-800">
                                            {student.name || student.email}
                                        </p>
                                        {isSubmitted ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                                <CheckCircle2 className="h-3 w-3" />
                                                提出済
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                <Clock3 className="h-3 w-3" />
                                                未提出
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 truncate text-xs text-slate-500">{student.email}</p>
                                    {student.availability?.updatedAt && (
                                        <p className="mt-1 text-[11px] text-slate-400">
                                            更新: {format(new Date(student.availability.updatedAt), "M/d HH:mm", { locale: ja })}
                                        </p>
                                    )}
                                </button>
                            )
                        })}
                        {students.length === 0 && (
                            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                                生徒データがありません。
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <section className="space-y-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">代行入力カレンダー</h3>
                            <p className="text-sm text-slate-500">
                                {selectedStudent ? `${selectedStudent.name || selectedStudent.email} さんの希望時間を入力` : "左の一覧から生徒を選択してください"}
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => router.refresh()}>
                            最新状態に更新
                        </Button>
                    </div>
                </div>

                {selectedStudent ? (
                    <AvailabilityCalendar
                        year={year}
                        month={month}
                        initialAvailableSlots={availableSlots}
                        initialUnavailableSlots={unavailableSlots}
                        onSave={handleSave}
                        onMonthChange={handleMonthChange}
                        workingHours={workingHours}
                        closedDays={closedDays}
                    />
                ) : (
                    <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500">
                        代行入力する生徒を選択してください。
                    </div>
                )}
            </section>
        </div>
    )
}
