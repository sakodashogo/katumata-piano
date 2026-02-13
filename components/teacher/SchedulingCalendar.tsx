"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MonthlySlotGridEditor } from "@/components/teacher/MonthlySlotGridEditor"
import { type TeacherWorkingHoursByDay } from "@/lib/teacher-working-hours"

type Lesson = {
    id: string
    startTime: Date | string
    endTime: Date | string
    roomId?: string | null
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL" | string
    status?: string
    isEditable?: boolean
}

type Props = {
    studentId: string
    studentName: string
    availableSlots: string[]
    unavailableSlots: string[]
    existingLessons: Lesson[]
    workingHours: TeacherWorkingHoursByDay
    year: number
    month: number
    onSave: (lessons: {
        startTime: Date
        endTime: Date
        roomId: string
        type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
    }[]) => Promise<boolean>
    isOpen: boolean
    onClose: () => void
}

export function SchedulingCalendar({
    studentId,
    studentName,
    availableSlots,
    unavailableSlots,
    existingLessons,
    workingHours,
    year,
    month,
    onSave,
    isOpen,
    onClose,
}: Props) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col overflow-hidden p-4 sm:p-6">
                <DialogHeader>
                    <DialogTitle>{studentName} - レッスン作成 ({year}年{month}月)</DialogTitle>
                </DialogHeader>
                <MonthlySlotGridEditor
                    studentId={studentId}
                    studentName={studentName}
                    availableSlots={availableSlots}
                    unavailableSlots={unavailableSlots}
                    existingLessons={existingLessons}
                    workingHours={workingHours}
                    year={year}
                    month={month}
                    onSave={onSave}
                    showSaveControls
                />
            </DialogContent>
        </Dialog>
    )
}
