"use client"

import { AvailabilityCalendar } from "@/components/availability/AvailabilityCalendar"
import { saveMonthlyAvailability } from "@/app/lib/actions/availability"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { type TeacherWorkingHoursByDay } from "@/lib/teacher-working-hours"

type Props = {
    studentId: string
    year: number
    month: number
    initialData: any
    workingHours: TeacherWorkingHoursByDay
}

export function StudentAvailabilityCard({ studentId, year, month, initialData, workingHours }: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const onSave = async (y: number, m: number, data: { availableSlots: string[], unavailableSlots: string[] }) => {
        const result = await saveMonthlyAvailability(studentId, y, m, data)
        if (result.success) {
            toast.success(`${y}年${m}月の希望を保存しました。`)
            router.refresh()
            return { success: true }
        } else {
            toast.error("保存に失敗しました。")
            return { success: false, error: result.error }
        }
    }

    const onMonthChange = (y: number, m: number) => {
        // Build new URL with updated query params
        const params = new URLSearchParams()
        params.set("year", y.toString())
        params.set("month", m.toString())
        router.push(`/teacher/students/${studentId}?${params.toString()}`)
    }

    // Safely cast Json to string[]
    const availableSlots = Array.isArray(initialData?.availableSlots)
        ? initialData.availableSlots.map(String)
        : []
    const unavailableSlots = Array.isArray(initialData?.unavailableSlots)
        ? initialData.unavailableSlots.map(String)
        : []

    return (
        <Card>
            <CardHeader>
                <CardTitle>希望スケジュール確認・編集</CardTitle>
                <CardDescription>
                    生徒が提出した希望日時を確認・編集できます。
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AvailabilityCalendar
                    year={year}
                    month={month}
                    initialAvailableSlots={availableSlots}
                    initialUnavailableSlots={unavailableSlots}
                    onSave={onSave}
                    onMonthChange={onMonthChange}
                    workingHours={workingHours}
                />
            </CardContent>
        </Card>
    )
}
