"use client"

import { AvailabilityCalendar } from "@/components/availability/AvailabilityCalendar"
import { saveMonthlyAvailability } from "@/app/lib/actions/availability"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { type TeacherWorkingHoursByDay } from "@/lib/teacher-working-hours"

type Props = {
    initialData: any
    year: number
    month: number
    workingHours: TeacherWorkingHoursByDay
}

export default function AvailabilityPageClient({ initialData, year, month, workingHours }: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const onSave = async (y: number, m: number, data: { availableSlots: string[], unavailableSlots: string[] }) => {
        const result = await saveMonthlyAvailability(undefined, y, m, data)
        if (result.success) {
            toast.success(`${year}年${month}月の希望を保存しました。`)
            router.refresh()
            return { success: true }
        } else {
            toast.error("保存に失敗しました。")
            return { success: false, error: result.error }
        }
    }

    const onMonthChange = (y: number, m: number) => {
        router.push(`/student/availability?year=${y}&month=${m}`)
    }

    // Safely cast Json to string[]
    const availableSlots = Array.isArray(initialData?.availableSlots)
        ? initialData.availableSlots.map(String)
        : []
    const unavailableSlots = Array.isArray(initialData?.unavailableSlots)
        ? initialData.unavailableSlots.map(String)
        : []

    return (
        <div className="container py-6">
            <h1 className="text-2xl font-bold mb-6">レッスンの希望日時</h1>
            <p className="mb-4 text-muted-foreground">
                レッスン可能な日時を選択してください。月を変更して先の予定も入力できます。
            </p>
            <AvailabilityCalendar
                year={year}
                month={month}
                initialAvailableSlots={availableSlots}
                initialUnavailableSlots={unavailableSlots}
                onSave={onSave}
                onMonthChange={onMonthChange}
                workingHours={workingHours}
            />
        </div>
    )
}
