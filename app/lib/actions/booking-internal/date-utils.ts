import { BOOKING_RULES } from "@/lib/constants"

export function isWithinStudentModificationWindow(lessonStart: Date) {
    const now = new Date()
    const diffInHours = (lessonStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    return diffInHours >= BOOKING_RULES.CANCELLATION_HOURS_BEFORE
}

export function addDays(base: Date, days: number) {
    const result = new Date(base)
    result.setDate(result.getDate() + days)
    return result
}

export function getMonthRange(target: Date) {
    const start = new Date(target.getFullYear(), target.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(target.getFullYear(), target.getMonth() + 1, 1, 0, 0, 0, 0)
    return { start, end }
}
