"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { addMonths, format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Sparkles, Save, Upload } from "lucide-react"
import { MonthlySlotGridEditor } from "@/components/teacher/MonthlySlotGridEditor"
import { MonthlyAllStudentsCalendar } from "@/components/teacher/MonthlyAllStudentsCalendar"
import {
    publishMonthlySchedule,
    replaceStudentMonthlyLessons,
} from "@/app/lib/actions/planning"
import { updateTeacherWorkingHours } from "@/app/lib/actions/teacher-working-hours"
import {
    generateSuggestedSchedule,
    ScheduleSuggestion,
    ScheduleSuggestionDiagnostic,
    LockedAssignment,
} from "@/app/lib/actions/schedule-maker"
import { useToast } from "@/components/ui/toast"
import {
    getDefaultTeacherWorkingHours,
    normalizeTeacherWorkingHourRanges,
    type TeacherWorkingHourRange,
    type TeacherWorkingHoursByDay,
} from "@/lib/teacher-working-hours"

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
    studentName?: string
    roomId: string | null
    status: string
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
}

type Shift = {
    id: string
    startTime: string | Date
    endTime: string | Date
}

type DraftLesson = {
    startTime: Date
    endTime: Date
    roomId: string
    type?: "REGULAR" | "AD_HOC" | "PRACTICE" | "SOLO_ADDITIONAL" | "DUET_ADDITIONAL"
}

type LessonTypeValue = Lesson["type"] | DraftLesson["type"] | null | undefined

type ClosedDayRecord = {
    id: string
    date: Date
    startTime: string | null
    endTime: string | null
    reason: string | null
}

type Props = {
    students: Student[]
    lessons: Lesson[]
    supportShifts?: Shift[]
    closedDays?: ClosedDayRecord[]
    workingHours: TeacherWorkingHoursByDay
    year: number
    month: number
    isPublished?: boolean
    publishedAt?: string | Date | null
}

function toDraftKey(lesson: DraftLesson) {
    return `${lesson.startTime.toISOString()}__${lesson.endTime.toISOString()}__${lesson.roomId}__${lesson.type || "REGULAR"}`
}

function normalizeLessonToDraft(lesson: Lesson): DraftLesson {
    return {
        startTime: new Date(lesson.startTime),
        endTime: new Date(lesson.endTime),
        roomId: lesson.roomId || "A",
        type: lesson.type || "REGULAR",
    }
}

function isContractLessonType(type: LessonTypeValue) {
    return (type || "REGULAR") === "REGULAR"
}

function isSameDraftSet(a: DraftLesson[], b: DraftLesson[]) {
    if (a.length !== b.length) return false
    const setA = new Set(a.map(toDraftKey))
    const setB = new Set(b.map(toDraftKey))
    if (setA.size !== setB.size) return false
    for (const key of setA) {
        if (!setB.has(key)) return false
    }
    return true
}

function isSameDraftMap(left: Record<string, DraftLesson[]>, right: Record<string, DraftLesson[]>) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length) return false
    for (let i = 0; i < leftKeys.length; i++) {
        if (leftKeys[i] !== rightKeys[i]) return false
        if (!isSameDraftSet(left[leftKeys[i]], right[rightKeys[i]])) return false
    }
    return true
}

function isSameIdSet(left: Set<string>, right: Set<string>) {
    if (left.size !== right.size) return false
    for (const id of left) {
        if (!right.has(id)) return false
    }
    return true
}

type WorkingHourDraftByDay = Record<number, TeacherWorkingHourRange[]>

const WORKING_HOUR_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const WORKING_HOUR_DAY_LABELS: Record<number, string> = {
    0: "日",
    1: "月",
    2: "火",
    3: "水",
    4: "木",
    5: "金",
    6: "土",
}

function cloneWorkingHourRangesByDay(source: TeacherWorkingHoursByDay): WorkingHourDraftByDay {
    const next: WorkingHourDraftByDay = getDefaultTeacherWorkingHours()
    for (let day = 0; day <= 6; day += 1) {
        next[day] = (source[day] || []).map((range) => ({
            startTime: range.startTime,
            endTime: range.endTime,
        }))
    }
    return next
}

function normalizeWorkingHourDraft(source: WorkingHourDraftByDay): TeacherWorkingHoursByDay {
    const next: TeacherWorkingHoursByDay = getDefaultTeacherWorkingHours()
    for (let day = 0; day <= 6; day += 1) {
        next[day] = normalizeTeacherWorkingHourRanges(source[day] || [])
    }
    return next
}

function getWorkingHoursCompareKey(source: TeacherWorkingHoursByDay) {
    const parts: string[] = []
    for (let day = 0; day <= 6; day += 1) {
        const dayRanges = normalizeTeacherWorkingHourRanges(source[day] || [])
        const dayKey = dayRanges.map((range) => `${range.startTime}-${range.endTime}`).join(",")
        parts.push(`${day}:${dayKey}`)
    }
    return parts.join("|")
}

export function MonthlyScheduler({
    students,
    lessons,
    supportShifts = [],
    closedDays = [],
    workingHours,
    year,
    month,
    isPublished = false,
    publishedAt = null,
}: Props) {
    const router = useRouter()
    const { toast } = useToast()

    const [studentQuery, setStudentQuery] = useState("")
    const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "")
    const [draftByStudent, setDraftByStudent] = useState<Record<string, DraftLesson[]>>({})
    const [dirtyStudentIds, setDirtyStudentIds] = useState<Set<string>>(new Set())
    const [isSavingSelected, setIsSavingSelected] = useState(false)
    const [isSavingAll, setIsSavingAll] = useState(false)
    const [isPublishingMonth, setIsPublishingMonth] = useState(false)
    const [isSavingWorkingHours, setIsSavingWorkingHours] = useState(false)
    const [activeWorkingHours, setActiveWorkingHours] = useState<TeacherWorkingHoursByDay>(workingHours)
    const [workingHourDraftByDay, setWorkingHourDraftByDay] = useState<WorkingHourDraftByDay>(() =>
        cloneWorkingHourRangesByDay(workingHours)
    )
    const [isAutoMode, setIsAutoMode] = useState(false)
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
    const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([])
    const [suggestionDiagnostics, setSuggestionDiagnostics] = useState<ScheduleSuggestionDiagnostic[]>([])
    const autoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const autoAppliedKeysRef = useRef<Record<string, Set<string>>>({})
    const lastSuggestionErrorRef = useRef("")
    const lastAppliedSuggestionsKeyRef = useRef("")

    const [baseLessons, setBaseLessons] = useState<Lesson[]>(lessons)
    useEffect(() => {
        setBaseLessons(lessons)
        setDraftByStudent({})
        setDirtyStudentIds(new Set())
        setSuggestions([])
        setSuggestionDiagnostics([])
        autoAppliedKeysRef.current = {}
        lastSuggestionErrorRef.current = ""
        lastAppliedSuggestionsKeyRef.current = ""
    }, [lessons, month, year])

    useEffect(() => {
        setActiveWorkingHours(workingHours)
        setWorkingHourDraftByDay(cloneWorkingHourRangesByDay(workingHours))
    }, [month, workingHours, year])

    useEffect(() => {
        if (students.length === 0) return
        if (!selectedStudentId || !students.some((student) => student.id === selectedStudentId)) {
            setSelectedStudentId(students[0].id)
        }
    }, [selectedStudentId, students])

    const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])

    const filteredStudents = useMemo(() => {
        const keyword = studentQuery.trim().toLowerCase()
        if (!keyword) return students
        return students.filter((student) => {
            const name = (student.name || "").toLowerCase()
            const email = student.email.toLowerCase()
            return name.includes(keyword) || email.includes(keyword)
        })
    }, [studentQuery, students])

    const normalizedWorkingHourDraft = useMemo(
        () => normalizeWorkingHourDraft(workingHourDraftByDay),
        [workingHourDraftByDay]
    )
    const activeWorkingHoursKey = useMemo(
        () => getWorkingHoursCompareKey(activeWorkingHours),
        [activeWorkingHours]
    )
    const draftWorkingHoursKey = useMemo(
        () => getWorkingHoursCompareKey(normalizedWorkingHourDraft),
        [normalizedWorkingHourDraft]
    )
    const hasWorkingHourChanges = activeWorkingHoursKey !== draftWorkingHoursKey

    const updateWorkingHourDayRanges = useCallback((dayOfWeek: number, ranges: TeacherWorkingHourRange[]) => {
        setWorkingHourDraftByDay((prev) => ({
            ...prev,
            [dayOfWeek]: ranges,
        }))
    }, [])

    const handleWorkingHourToggle = useCallback((dayOfWeek: number, enabled: boolean) => {
        if (enabled) {
            const fallback = activeWorkingHours[dayOfWeek]?.[0] || { startTime: "14:00", endTime: "20:00" }
            updateWorkingHourDayRanges(dayOfWeek, [{ startTime: fallback.startTime, endTime: fallback.endTime }])
            return
        }
        updateWorkingHourDayRanges(dayOfWeek, [])
    }, [activeWorkingHours, updateWorkingHourDayRanges])

    const handleWorkingHourRangeField = useCallback((
        dayOfWeek: number,
        index: number,
        field: "startTime" | "endTime",
        value: string
    ) => {
        setWorkingHourDraftByDay((prev) => {
            const current = [...(prev[dayOfWeek] || [])]
            while (current.length <= index) {
                current.push({ startTime: "", endTime: "" })
            }
            current[index] = { ...current[index], [field]: value }
            return { ...prev, [dayOfWeek]: current }
        })
    }, [])

    const handleWorkingHourSecondaryToggle = useCallback((dayOfWeek: number, enabled: boolean) => {
        setWorkingHourDraftByDay((prev) => {
            const current = [...(prev[dayOfWeek] || [])]
            if (!enabled) {
                return { ...prev, [dayOfWeek]: current.slice(0, 1) }
            }
            if (current.length >= 2) return prev
            return {
                ...prev,
                [dayOfWeek]: [...current, { startTime: "10:00", endTime: "12:00" }],
            }
        })
    }, [])

    const handleSaveWorkingHours = useCallback(async () => {
        setIsSavingWorkingHours(true)
        const payload = Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            ranges: normalizeTeacherWorkingHourRanges(workingHourDraftByDay[dayOfWeek] || []),
        }))
        const result = await updateTeacherWorkingHours({ days: payload })
        setIsSavingWorkingHours(false)
        if (!result.success || !result.data) {
            toast.error(result.error || "営業時間設定の保存に失敗しました。")
            return
        }
        setActiveWorkingHours(result.data)
        setWorkingHourDraftByDay(cloneWorkingHourRangesByDay(result.data))
        toast.success("曜日別のレッスン許可時間を保存しました。")
    }, [toast, workingHourDraftByDay])

    const effectiveLessons = useMemo(() => {
        const draftStudentIds = new Set(Object.keys(draftByStudent))
        const persisted = baseLessons.filter((lesson) => !draftStudentIds.has(lesson.studentId))
        const draftRows: Lesson[] = Object.entries(draftByStudent).flatMap(([studentId, studentLessons], index) =>
            studentLessons.map((lesson, lessonIndex) => ({
                id: `draft-${studentId}-${index}-${lessonIndex}-${lesson.startTime.getTime()}`,
                studentId,
                startTime: lesson.startTime,
                endTime: lesson.endTime,
                roomId: lesson.roomId,
                status: "DRAFT",
                type: lesson.type || "REGULAR",
            }))
        )
        return [...persisted, ...draftRows]
    }, [baseLessons, draftByStudent])

    const selectedStudent = studentById.get(selectedStudentId) || null
    const selectedStudentBaseline = useMemo(
        () => baseLessons.filter((lesson) => lesson.studentId === selectedStudentId).map(normalizeLessonToDraft),
        [baseLessons, selectedStudentId]
    )

    const currentSelectedDraft = draftByStudent[selectedStudentId] || selectedStudentBaseline
    const selectedStudentLessonsForEditor = useMemo(
        () =>
            effectiveLessons.map((lesson) => ({
                ...lesson,
                studentName: studentById.get(lesson.studentId)?.name || studentById.get(lesson.studentId)?.email || "名前未設定",
                isEditable: lesson.studentId === selectedStudentId,
            })),
        [effectiveLessons, selectedStudentId, studentById]
    )

    const draftLessonsCountByStudent = useMemo(() => {
        const map = new Map<string, number>()
        for (const lesson of effectiveLessons) {
            if (!isContractLessonType(lesson.type)) continue
            map.set(lesson.studentId, (map.get(lesson.studentId) || 0) + 1)
        }
        return map
    }, [effectiveLessons])

    const lockedAssignmentsRef = useRef<LockedAssignment[]>([])
    const lockedAssignmentsKeyRef = useRef("")
    const lockedAssignments = useMemo<LockedAssignment[]>(() => {
        const next = Object.entries(draftByStudent).flatMap(([studentId, draftLessons]) =>
            draftLessons.map((lesson) => ({
                studentId,
                roomId: lesson.roomId,
                startTime: lesson.startTime,
                endTime: lesson.endTime,
                type: lesson.type,
            }))
        )
        const nextKey = next
            .map(a => `${a.studentId}:${a.startTime.getTime()}:${a.endTime.getTime()}:${a.roomId}:${a.type || "REGULAR"}`)
            .sort()
            .join("|")
        if (nextKey === lockedAssignmentsKeyRef.current) {
            return lockedAssignmentsRef.current
        }
        lockedAssignmentsKeyRef.current = nextKey
        lockedAssignmentsRef.current = next
        return next
    }, [draftByStudent])

    const runSuggestionGeneration = useCallback(async (locks: LockedAssignment[]) => {
        setIsGeneratingSuggestions(true)
        try {
            const result = await generateSuggestedSchedule(year, month, {
                lockedAssignments: locks,
                overrideStudentIds: Object.keys(draftByStudent),
            })
            if (!result.success || !result.suggestions) {
                setSuggestions([])
                setSuggestionDiagnostics([])
                const message = result.error || "提案の作成に失敗しました。"
                if (lastSuggestionErrorRef.current !== message) {
                    lastSuggestionErrorRef.current = message
                    toast.error(message)
                }
                return
            }
            lastSuggestionErrorRef.current = ""
            setSuggestions(result.suggestions)
            setSuggestionDiagnostics(result.diagnostics || [])
        } catch {
            setSuggestions([])
            setSuggestionDiagnostics([])
            const message = "提案の作成中にエラーが発生しました。"
            if (lastSuggestionErrorRef.current !== message) {
                lastSuggestionErrorRef.current = message
                toast.error(message)
            }
        } finally {
            setIsGeneratingSuggestions(false)
        }
    }, [draftByStudent, month, toast, year])

    useEffect(() => {
        if (!isAutoMode) return
        if (autoDebounceRef.current) {
            clearTimeout(autoDebounceRef.current)
        }
        autoDebounceRef.current = setTimeout(() => {
            void runSuggestionGeneration(lockedAssignments)
        }, 450)
        return () => {
            if (autoDebounceRef.current) {
                clearTimeout(autoDebounceRef.current)
            }
        }
    }, [isAutoMode, lockedAssignments, runSuggestionGeneration])

    const handleMonthChange = (offset: number) => {
        const date = addMonths(new Date(year, month - 1), offset)
        const params = new URLSearchParams()
        params.set("year", date.getFullYear().toString())
        params.set("month", (date.getMonth() + 1).toString())
        router.push(`/teacher/schedule/monthly?${params.toString()}`)
    }

    const handleDraftChangeForSelected = useCallback((updated: DraftLesson[]) => {
        if (!selectedStudentId) return
        const baseline = selectedStudentBaseline
        const isBaseline = isSameDraftSet(updated, baseline)
        setDraftByStudent((prev) => {
            const prevDraft = prev[selectedStudentId]
            if (isBaseline) {
                if (typeof prevDraft === "undefined") return prev
                const next = { ...prev }
                delete next[selectedStudentId]
                return next
            }
            if (prevDraft && isSameDraftSet(prevDraft, updated)) {
                return prev
            }
            return { ...prev, [selectedStudentId]: updated }
        })
        setDirtyStudentIds((prev) => {
            const hasDirty = prev.has(selectedStudentId)
            if (isBaseline && !hasDirty) return prev
            if (!isBaseline && hasDirty) return prev
            const next = new Set(prev)
            if (isBaseline) next.delete(selectedStudentId)
            else next.add(selectedStudentId)
            return next
        })
    }, [selectedStudentBaseline, selectedStudentId])

    const saveStudentDraft = async (studentId: string, draftLessons: DraftLesson[]) => {
        const result = await replaceStudentMonthlyLessons({
            studentId,
            year,
            month,
            lessons: draftLessons,
        })
        if (!result.success) {
            return { success: false as const, error: result.error || "保存に失敗しました。" }
        }
        return { success: true as const }
    }

    const commitSavedDraftToBase = (studentId: string, draftLessons: DraftLesson[]) => {
        setBaseLessons((prev) => {
            const kept = prev.filter((lesson) => lesson.studentId !== studentId)
            const nextRows: Lesson[] = draftLessons.map((lesson, index) => ({
                id: `local-${studentId}-${index}-${lesson.startTime.getTime()}`,
                studentId,
                startTime: lesson.startTime,
                endTime: lesson.endTime,
                roomId: lesson.roomId,
                status: isPublished ? "BOOKED" : "DRAFT",
                type: lesson.type || "REGULAR",
            }))
            return [...kept, ...nextRows].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        })
    }

    const handleSaveSelected = async () => {
        if (!selectedStudentId) return
        const draftLessons = currentSelectedDraft
        setIsSavingSelected(true)
        const result = await saveStudentDraft(selectedStudentId, draftLessons)
        setIsSavingSelected(false)
        if (!result.success) {
            toast.error(result.error)
            return
        }
        commitSavedDraftToBase(selectedStudentId, draftLessons)
        setDraftByStudent((prev) => {
            const next = { ...prev }
            delete next[selectedStudentId]
            return next
        })
        setDirtyStudentIds((prev) => {
            const next = new Set(prev)
            next.delete(selectedStudentId)
            return next
        })
        delete autoAppliedKeysRef.current[selectedStudentId]
        toast.success(`${selectedStudent?.name || "生徒"}の予定を保存しました。`)
        router.refresh()
    }

    const handleSaveAllDirty = async () => {
        const dirtyIds = Array.from(dirtyStudentIds)
        if (dirtyIds.length === 0) return
        setIsSavingAll(true)
        let successCount = 0
        let failedCount = 0
        let firstError = ""
        for (const studentId of dirtyIds) {
            if (!draftByStudent[studentId]) continue
            const draftLessons = draftByStudent[studentId]
            const result = await saveStudentDraft(studentId, draftLessons)
            if (!result.success) {
                failedCount += 1
                if (!firstError) firstError = result.error
                continue
            }
            successCount += 1
            commitSavedDraftToBase(studentId, draftLessons)
            setDraftByStudent((prev) => {
                const next = { ...prev }
                delete next[studentId]
                return next
            })
            setDirtyStudentIds((prev) => {
                const next = new Set(prev)
                next.delete(studentId)
                return next
            })
            delete autoAppliedKeysRef.current[studentId]
        }
        setIsSavingAll(false)
        if (failedCount === 0) {
            toast.success(`${successCount}人分の予定を保存しました。`)
        } else {
            toast.error(firstError || `${failedCount}人分の保存に失敗しました。`)
        }
        if (successCount > 0) {
            router.refresh()
        }
    }

    const handlePublishMonth = async () => {
        setIsPublishingMonth(true)
        const result = await publishMonthlySchedule(year, month)
        setIsPublishingMonth(false)
        if (!result.success) {
            toast.error(result.error || "公開に失敗しました。")
            return
        }
        if (result.alreadyPublished) {
            toast.info(`${year}年${month}月は確定済みです。変更を再反映しました。`)
        } else {
            toast.success(`${year}年${month}月の下書きを公開しました。`)
        }
        router.refresh()
    }

    const diagnosticsByStudent = useMemo(() => {
        return new Map(suggestionDiagnostics.map((diagnostic) => [diagnostic.studentId, diagnostic]))
    }, [suggestionDiagnostics])
    const shortageDiagnostics = useMemo(
        () => suggestionDiagnostics.filter((diagnostic) => diagnostic.shortage > 0),
        [suggestionDiagnostics]
    )

    const applyRecommendedToDrafts = useCallback((targetSuggestions: ScheduleSuggestion[], showToast = false) => {
        const recommended = targetSuggestions.filter((suggestion) => suggestion.isRecommended && !suggestion.conflict)
        const recommendationsByStudent: Record<string, DraftLesson[]> = {}
        for (const suggestion of recommended) {
            const studentId = suggestion.studentId
            if (!studentById.has(studentId)) continue
            if (!recommendationsByStudent[studentId]) recommendationsByStudent[studentId] = []
            recommendationsByStudent[studentId].push({
                startTime: new Date(suggestion.slot.startTime),
                endTime: new Date(suggestion.slot.endTime),
                roomId: suggestion.slot.roomId === "B" ? "B" : "A",
                type: suggestion.type || "REGULAR",
            })
        }

        const mergedDrafts: Record<string, DraftLesson[]> = {}
        const nextAutoAppliedByStudent: Record<string, Set<string>> = {}
        const shortageStudents: string[] = []
        const shortageDetails: string[] = []
        for (const student of students) {
            const baseline = baseLessons
                .filter((lesson) => lesson.studentId === student.id)
                .map(normalizeLessonToDraft)
            const currentDraft = draftByStudent[student.id] || baseline
            const previousAutoKeys = autoAppliedKeysRef.current[student.id] || new Set<string>()
            const manualLessons = currentDraft.filter((lesson) => !previousAutoKeys.has(toDraftKey(lesson)))
            const targetCount = Math.max(student.defaultLessonCount || 0, 0)
            const merged = [...manualLessons]
            let mergedContractCount = merged.reduce(
                (count, lesson) => count + (isContractLessonType(lesson.type) ? 1 : 0),
                0
            )
            const mergedKeys = new Set(merged.map(toDraftKey))
            const nextAutoKeys = new Set<string>()
            const studentRecommendations = [...(recommendationsByStudent[student.id] || [])].sort(
                (a, b) => a.startTime.getTime() - b.startTime.getTime()
            )
            for (const lesson of studentRecommendations) {
                if (mergedContractCount >= targetCount) break
                const key = toDraftKey(lesson)
                if (mergedKeys.has(key)) continue
                merged.push(lesson)
                mergedKeys.add(key)
                nextAutoKeys.add(key)
                if (isContractLessonType(lesson.type)) {
                    mergedContractCount += 1
                }
            }
            if (mergedContractCount < targetCount) {
                shortageStudents.push(student.name || student.email)
                const diagnostic = diagnosticsByStudent.get(student.id)
                if (diagnostic?.reasonText) {
                    shortageDetails.push(`${student.name || student.email}: ${diagnostic.reasonText}`)
                }
            }
            nextAutoAppliedByStudent[student.id] = nextAutoKeys
            if (!isSameDraftSet(merged, baseline)) {
                mergedDrafts[student.id] = merged
            }
        }

        autoAppliedKeysRef.current = nextAutoAppliedByStudent
        const nextDirty = new Set(Object.keys(mergedDrafts))
        setDraftByStudent((prev) => (isSameDraftMap(prev, mergedDrafts) ? prev : mergedDrafts))
        setDirtyStudentIds((prev) => (isSameIdSet(prev, nextDirty) ? prev : nextDirty))
        if (showToast) {
            if (shortageStudents.length === 0) {
                toast.success("提案内容を全生徒の編集下書きに反映しました。")
            } else {
                const preview = shortageDetails.slice(0, 2).join(" / ")
                const suffix = shortageDetails.length > 2 ? " ほか" : ""
                const detailText = preview ? ` ${preview}${suffix}` : ""
                toast.info(`提案を反映しました。${shortageStudents.length}人は契約回数に未達です。${detailText}`)
            }
        }
    }, [baseLessons, diagnosticsByStudent, draftByStudent, studentById, students, toast])

    const applyRecommendedToDraftsRef = useRef(applyRecommendedToDrafts)
    applyRecommendedToDraftsRef.current = applyRecommendedToDrafts

    const handleApplyRecommendedToDrafts = () => {
        applyRecommendedToDrafts(suggestions, true)
    }

    const suggestionCountByStudent = useMemo(() => {
        const map = new Map<string, number>()
        for (const suggestion of suggestions) {
            if (!suggestion.isRecommended || suggestion.conflict) continue
            map.set(suggestion.studentId, (map.get(suggestion.studentId) || 0) + 1)
        }
        return map
    }, [suggestions])

    useEffect(() => {
        if (!isAutoMode) return
        if (isGeneratingSuggestions) return
        if (suggestions.length === 0) {
            lastAppliedSuggestionsKeyRef.current = ""
            return
        }
        const key = suggestions
            .filter(s => s.isRecommended && !s.conflict)
            .map(s => s.id)
            .sort()
            .join("|")
        if (key === lastAppliedSuggestionsKeyRef.current) return
        lastAppliedSuggestionsKeyRef.current = key
        applyRecommendedToDraftsRef.current(suggestions, false)
    }, [isAutoMode, isGeneratingSuggestions, suggestions])

    const draftLessons = useMemo(
        () => effectiveLessons.filter((lesson) => lesson.status === "DRAFT"),
        [effectiveLessons]
    )

    const allLessonsForCalendar = useMemo(
        () =>
            effectiveLessons.map((lesson) => ({
                ...lesson,
                studentName: studentById.get(lesson.studentId)?.name || studentById.get(lesson.studentId)?.email || "名前未設定",
            })),
        [effectiveLessons, studentById]
    )

    return (
        <div className="flex min-h-[calc(100vh-120px)] flex-col gap-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3">
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => handleMonthChange(-1)}>
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        前月
                    </Button>
                    <h2 className="text-lg font-bold">{year}年 {month}月</h2>
                    <Button variant="outline" onClick={() => handleMonthChange(1)}>
                        次月
                        <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">
                        下書き {draftLessons.length}件
                    </Badge>
                    <Badge variant="outline">
                        公開済み {effectiveLessons.filter((lesson) => lesson.status === "BOOKED").length}件
                    </Badge>
                    {isPublished && (
                        <Badge variant="secondary">
                            公開済み {publishedAt ? format(new Date(publishedAt), "yyyy/MM/dd HH:mm") : ""}
                        </Badge>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
                <div>
                    <div className="text-sm font-semibold text-slate-900">曜日別レッスン許可時間</div>
                    <p className="text-xs text-slate-500">ここで設定した時間帯を月間提案・週次編集・シフト・希望入力に共通反映します。</p>
                </div>
                <Button
                    variant="outline"
                    onClick={handleSaveWorkingHours}
                    disabled={isSavingWorkingHours || !hasWorkingHourChanges}
                >
                    {isSavingWorkingHours ? "保存中..." : "許可時間を保存"}
                </Button>
            </div>

            <div className="rounded-lg border bg-white p-3">
                <div className="grid gap-2">
                    {WORKING_HOUR_DAY_ORDER.map((dayOfWeek) => {
                        const dayRanges = workingHourDraftByDay[dayOfWeek] || []
                        const enabled = dayRanges.length > 0
                        const primary = dayRanges[0] || { startTime: "14:00", endTime: "20:00" }
                        const hasSecondary = dayRanges.length > 1
                        const secondary = dayRanges[1] || { startTime: "10:00", endTime: "12:00" }

                        return (
                            <div key={dayOfWeek} className="rounded border bg-slate-50 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <label className="inline-flex items-center gap-2 font-semibold text-slate-800">
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={(event) => handleWorkingHourToggle(dayOfWeek, event.target.checked)}
                                        />
                                        {WORKING_HOUR_DAY_LABELS[dayOfWeek]}曜
                                    </label>

                                    <span className="text-slate-500">第1枠</span>
                                    <input
                                        type="time"
                                        value={primary.startTime}
                                        onChange={(event) => handleWorkingHourRangeField(dayOfWeek, 0, "startTime", event.target.value)}
                                        disabled={!enabled}
                                        className="h-8 rounded border bg-white px-2 text-xs disabled:bg-slate-100"
                                    />
                                    <span className="text-slate-500">〜</span>
                                    <input
                                        type="time"
                                        value={primary.endTime}
                                        onChange={(event) => handleWorkingHourRangeField(dayOfWeek, 0, "endTime", event.target.value)}
                                        disabled={!enabled}
                                        className="h-8 rounded border bg-white px-2 text-xs disabled:bg-slate-100"
                                    />

                                    <label className="inline-flex items-center gap-1 text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={hasSecondary}
                                            disabled={!enabled}
                                            onChange={(event) => handleWorkingHourSecondaryToggle(dayOfWeek, event.target.checked)}
                                        />
                                        第2枠
                                    </label>
                                    <input
                                        type="time"
                                        value={secondary.startTime}
                                        onChange={(event) => handleWorkingHourRangeField(dayOfWeek, 1, "startTime", event.target.value)}
                                        disabled={!enabled || !hasSecondary}
                                        className="h-8 rounded border bg-white px-2 text-xs disabled:bg-slate-100"
                                    />
                                    <span className="text-slate-500">〜</span>
                                    <input
                                        type="time"
                                        value={secondary.endTime}
                                        onChange={(event) => handleWorkingHourRangeField(dayOfWeek, 1, "endTime", event.target.value)}
                                        disabled={!enabled || !hasSecondary}
                                        className="h-8 rounded border bg-white px-2 text-xs disabled:bg-slate-100"
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
                <div className="flex items-center gap-2">
                    <Button
                        variant={isAutoMode ? "primary" : "outline"}
                        onClick={() => setIsAutoMode((prev) => !prev)}
                    >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {isAutoMode ? "自動提案モード ON" : "自動割り当て提案"}
                    </Button>
                    {isAutoMode && (
                        <Button variant="outline" onClick={handleApplyRecommendedToDrafts} disabled={suggestions.length === 0}>
                            提案を全生徒に反映
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleSaveSelected}
                        disabled={isSavingSelected || !dirtyStudentIds.has(selectedStudentId)}
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {isSavingSelected ? "保存中..." : "選択生徒を保存"}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleSaveAllDirty}
                        disabled={isSavingAll || dirtyStudentIds.size === 0}
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        {isSavingAll ? "保存中..." : `変更済み一括保存 (${dirtyStudentIds.size})`}
                    </Button>
                    <Button
                        onClick={handlePublishMonth}
                        disabled={isPublishingMonth || draftLessons.length === 0}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        {isPublishingMonth ? "公開中..." : "下書きを公開"}
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="flex min-h-[760px] flex-col rounded-lg border bg-white">
                    <div className="border-b p-3">
                        <div className="text-sm font-semibold text-slate-900">生徒選択</div>
                        <input
                            value={studentQuery}
                            onChange={(event) => setStudentQuery(event.target.value)}
                            placeholder="生徒名 / メール検索"
                            className="mt-2 h-9 w-full rounded border px-2 text-sm"
                        />
                    </div>
                    <div className="flex-1 overflow-auto p-2">
                        {filteredStudents.map((student) => {
                            const lessonCount = draftLessonsCountByStudent.get(student.id) || 0
                            const suggestionCount = suggestionCountByStudent.get(student.id) || 0
                            const shortage = diagnosticsByStudent.get(student.id)
                            const isDirty = dirtyStudentIds.has(student.id)
                            const isActive = student.id === selectedStudentId
                            return (
                                <button
                                    key={student.id}
                                    onClick={() => setSelectedStudentId(student.id)}
                                    className={`
                                        mb-2 w-full rounded border px-3 py-2 text-left transition-colors
                                        ${isActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}
                                    `}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="truncate text-sm font-semibold text-slate-800">
                                            {student.name || student.email}
                                        </div>
                                        {isDirty && <Badge variant="outline" className="text-[10px]">未保存</Badge>}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                        <span>{lessonCount} / {student.defaultLessonCount}回</span>
                                        {isAutoMode && suggestionCount > 0 && (
                                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                                                提案 {suggestionCount}
                                            </span>
                                        )}
                                        {isAutoMode && shortage && shortage.shortage > 0 && (
                                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                                                上限{shortage.maxPossibleRegularCount}/目標{shortage.targetRegularCount}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                        {filteredStudents.length === 0 && (
                            <p className="px-2 py-4 text-sm text-slate-500">該当する生徒が見つかりません。</p>
                        )}
                    </div>
                </aside>

                <section className="min-h-[760px] rounded-lg border bg-slate-50 p-3">
                    {!selectedStudent ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                            生徒を選択してください。
                        </div>
                    ) : (
                        <div className="flex h-full flex-col gap-3">
                            {isAutoMode && (
                                <div className="rounded border bg-white px-3 py-2 text-xs text-slate-600">
                                    <div className="font-semibold text-slate-800">自動提案モード</div>
                                    <div className="mt-1">
                                        手動編集内容を固定条件にして提案を再計算します。
                                        {isGeneratingSuggestions ? " 再計算中..." : ` 推奨候補: ${suggestions.filter((s) => s.isRecommended && !s.conflict).length}件`}
                                    </div>
                                    {!isGeneratingSuggestions && shortageDiagnostics.length > 0 && (
                                        <div className="mt-1 text-amber-700">
                                            未達見込み: {shortageDiagnostics.length}人
                                            {selectedStudent && diagnosticsByStudent.get(selectedStudent.id)?.shortage
                                                ? ` / ${diagnosticsByStudent.get(selectedStudent.id)?.reasonText}`
                                                : ""}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex-1">
                                <MonthlySlotGridEditor
                                    studentId={selectedStudent.id}
                                    studentName={selectedStudent.name || selectedStudent.email}
                                    availableSlots={
                                        Array.isArray(selectedStudent.availability?.availableSlots)
                                            ? selectedStudent.availability!.availableSlots.map(String)
                                            : []
                                    }
                                    unavailableSlots={
                                        Array.isArray(selectedStudent.availability?.unavailableSlots)
                                            ? selectedStudent.availability!.unavailableSlots.map(String)
                                            : []
                                    }
                                    existingLessons={selectedStudentLessonsForEditor}
                                    supportShifts={supportShifts}
                                    closedDays={closedDays}
                                    workingHours={activeWorkingHours}
                                    year={year}
                                    month={month}
                                    onDraftChange={handleDraftChangeForSelected}
                                    showSaveControls={false}
                                />
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <section className="rounded-lg border bg-slate-50 p-3">
                <MonthlyAllStudentsCalendar
                    lessons={allLessonsForCalendar}
                    supportShifts={supportShifts}
                    closedDays={closedDays}
                    year={year}
                    month={month}
                />
            </section>
        </div>
    )
}
