"use client"

import { useState, useTransition } from "react"
import { publishFixedSchedule } from "@/app/lib/actions/planning"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, User, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { format, addDays, startOfWeek, setHours, setMinutes } from "date-fns"
import { ja } from "date-fns/locale"
import { useToast } from "@/components/ui/toast"

type Student = {
    id: string
    name: string | null
    availabilities: any[]
}

type Assignment = {
    id: string // temp id
    dayOfWeek: number
    hour: number
    minute: number
    studentId: string
    duration: number
    roomId: string
}

export function PlanningBoard({ students }: { students: Student[] }) {
    const { toast } = useToast()
    const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [targetMonth, setTargetMonth] = useState<string>(format(new Date(), "yyyy-MM"))
    const [selectedRoom, setSelectedRoom] = useState<string>("A")
    const [isPending, startTransition] = useTransition()

    // Generate timeslots 13:00 - 21:00 (30 min intervals)
    const startHour = 13
    const endHour = 21
    const timeSlots: string[] = []
    for (let h = startHour; h < endHour; h++) {
        timeSlots.push(`${h}:00`)
        timeSlots.push(`${h}:30`)
    }

    const days = ["月", "火", "水", "木", "金", "土", "日"]
    // 0=Sun, 1=Mon... but we want Mon start.
    // date-fns startOfWeek(..., {weekStartsOn: 1})
    // Let's map visual col index 0->Mon(1), 1->Tue(2)... 6->Sun(0)
    const colToDayOfWeek = (colIndex: number) => (colIndex + 1) % 7

    const handleCellClick = (dayIndex: number, timeStr: string) => {
        if (!selectedStudent) return

        const [h, m] = timeStr.split(":").map(Number)
        const dayOfWeek = colToDayOfWeek(dayIndex)

        // check conflict
        const isOccupied = assignments.some(a =>
            a.dayOfWeek === dayOfWeek &&
            a.hour === h &&
            a.minute === m &&
            a.roomId === selectedRoom
        )

        if (isOccupied) {
            // Remove assignment?
            setAssignments(prev => prev.filter(a => !(a.dayOfWeek === dayOfWeek && a.hour === h && a.minute === m && a.roomId === selectedRoom)))
            return
        }

        const newAssignment: Assignment = {
            id: Math.random().toString(36),
            dayOfWeek,
            hour: h,
            minute: m,
            studentId: selectedStudent,
            duration: 30, // Default 30 min
            roomId: selectedRoom
        }
        setAssignments(prev => [...prev, newAssignment])
        // Don't clear selection to allow multiple placements
    }

    const handlePublish = () => {
        startTransition(async () => {
            const res = await publishFixedSchedule(targetMonth, assignments)
            if (res.success) {
                toast({ title: "スケジュールを確定しました", description: `${targetMonth}月のレッスンを作成しました。` })
            } else {
                toast({ variant: "destructive", title: "エラー", description: "スケジュールの作成に失敗しました。" })
            }
        })
    }

    const getStudentName = (id: string) => students.find(s => s.id === id)?.name || "Unknown"

    return (
        <div className="flex gap-6 h-[calc(100vh-200px)]">
            {/* Sidebar: Students */}
            <Card className="w-64 flex flex-col">
                <CardHeader>
                    <CardTitle className="text-sm">生徒リスト</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-2 space-y-2">
                    {students.map(student => {
                        const count = assignments.filter(a => a.studentId === student.id).length
                        return (
                            <div
                                key={student.id}
                                onClick={() => setSelectedStudent(student.id)}
                                className={cn(
                                    "p-2 rounded cursor-pointer text-sm flex justify-between items-center transition-colors",
                                    selectedStudent === student.id ? "bg-blue-100 ring-2 ring-blue-500" : "hover:bg-slate-100",
                                    count > 0 && "bg-green-50"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-slate-400" />
                                    <span className="truncate">{student.name}</span>
                                </div>
                                {count > 0 && <span className="bg-green-200 text-green-800 text-xs px-1.5 rounded-full">{count}</span>}
                            </div>
                        )
                    })}
                </CardContent>
            </Card>

            {/* Main: Grid */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
                    <div className="flex items-center gap-4">
                        <Select value={targetMonth} onValueChange={setTargetMonth}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="対象月" />
                            </SelectTrigger>
                            <SelectContent>
                                {Array.from({ length: 4 }).map((_, i) => {
                                    const d = new Date()
                                    d.setMonth(d.getMonth() + i)
                                    const val = format(d, "yyyy-MM")
                                    return <SelectItem key={val} value={val}>{format(d, "yyyy年M月")}</SelectItem>
                                })}
                            </SelectContent>
                        </Select>

                        <div className="flex bg-slate-100 rounded-lg p-1">
                            <button
                                onClick={() => setSelectedRoom("A")}
                                className={cn("px-3 py-1 text-sm rounded transition-all", selectedRoom === "A" ? "bg-white shadow" : "text-slate-500")}
                            >
                                A教室
                            </button>
                            <button
                                onClick={() => setSelectedRoom("B")}
                                className={cn("px-3 py-1 text-sm rounded transition-all", selectedRoom === "B" ? "bg-white shadow" : "text-slate-500")}
                            >
                                B教室
                            </button>
                        </div>
                    </div>

                    <Button onClick={handlePublish} disabled={isPending || assignments.length === 0}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {targetMonth}月の予定を確定
                    </Button>
                </div>

                <div className="flex-1 bg-white rounded-lg border overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="grid grid-cols-8 border-b bg-slate-50">
                        <div className="p-2 text-center text-xs font-medium text-slate-500 border-r">時間</div>
                        {days.map((day, i) => (
                            <div key={day} className={cn("p-2 text-center text-sm font-medium border-r last:border-0", i >= 5 && "text-red-500")}>
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Body */}
                    <div className="overflow-y-auto flex-1">
                        {timeSlots.map((time, timeIdx) => (
                            <div key={time} className="grid grid-cols-8 border-b last:border-0">
                                <div className="p-2 text-center text-xs text-slate-400 border-r bg-slate-50/50 flex items-center justify-center">
                                    {time}
                                </div>
                                {days.map((_, dayIdx) => {
                                    const [h, m] = time.split(":").map(Number)
                                    const dayOfWeek = colToDayOfWeek(dayIdx)
                                    const assignment = assignments.find(a =>
                                        a.dayOfWeek === dayOfWeek &&
                                        a.hour === h &&
                                        a.minute === m &&
                                        a.roomId === selectedRoom
                                    )

                                    return (
                                        <div
                                            key={`${dayIdx}-${time}`}
                                            className={cn(
                                                "border-r last:border-0 h-12 relative cursor-pointer hover:bg-slate-50 transition-colors",
                                                assignment ? "bg-blue-100 hover:bg-blue-200" : ""
                                            )}
                                            onClick={() => handleCellClick(dayIdx, time)}
                                        >
                                            {assignment && (
                                                <div className="absolute inset-x-1 inset-y-1 bg-blue-500 text-white rounded text-xs flex items-center justify-center shadow-sm overflow-hidden">
                                                    <span className="truncate px-1">{getStudentName(assignment.studentId)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-xs text-slate-500 text-right">
                    ※生徒を選択して枠をクリックすると配置できます。配置済み枠をクリックすると解除されます。
                </div>
            </div>
        </div>
    )
}
