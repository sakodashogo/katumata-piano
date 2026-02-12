export const LESSON_TYPE_LABELS: Record<string, string> = {
    REGULAR: "通常レッスン",
    AD_HOC: "追加レッスン",
    PRACTICE: "自主練",
    SOLO_ADDITIONAL: "ソロ追加",
    DUET_ADDITIONAL: "連弾追加",
}

export const LESSON_STATUS_LABELS: Record<string, string> = {
    BOOKED: "予約済み",
    COMPLETED: "完了",
    CANCELLED: "キャンセル済み",
}

export const LESSON_STATUS_STYLES: Record<string, string> = {
    BOOKED: "text-blue-600 bg-blue-50",
    COMPLETED: "text-green-600 bg-green-50",
    CANCELLED: "text-red-600 bg-red-50",
}

export const DAY_LABELS: Record<string, string> = {
    monday: "月曜日",
    tuesday: "火曜日",
    wednesday: "水曜日",
    thursday: "木曜日",
    friday: "金曜日",
    saturday: "土曜日",
    sunday: "日曜日",
}

export const ROOMS = {
    A: { id: 'A', name: 'Room A (グランドピアノ)' },
    B: { id: 'B', name: 'Room B (アップライト)' },
} as const

export const SLOT_MENU_LABELS: Record<string, string> = {
    PRACTICE: '自主練習',
    SOLO_ADDITIONAL: 'ソロ追加',
    DUET_ADDITIONAL: '連弾追加',
}

export const MENU_DURATION_OPTIONS: Record<string, number[]> = {
    PRACTICE: [30, 45, 60],
    SOLO_ADDITIONAL: [30, 45],
    DUET_ADDITIONAL: [45, 60],
}

export const WEEKDAY_OPTIONS = [
    { value: 1, label: '月' },
    { value: 2, label: '火' },
    { value: 3, label: '水' },
    { value: 4, label: '木' },
    { value: 5, label: '金' },
    { value: 6, label: '土' },
    { value: 0, label: '日' },
] as const

export const BOOKING_RULES = {
    CANCELLATION_HOURS_BEFORE: 48, // 2 days
    RESCHEDULE_WINDOW_DAYS: 30,    // 1 month
    MAX_RESCHEDULES_PER_MONTH: 2,
}
