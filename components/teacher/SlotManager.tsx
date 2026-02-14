"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Plus, List, BarChart3 } from "lucide-react"
import { BatchCreationForm } from "./BatchCreationForm"
import { DraftSlotList } from "./DraftSlotList"
import { SlotTimeline } from "./SlotTimeline"

type Menu = {
    id: string
    name: string
    durationMin: number
    price: number
    description: string | null
}

type SlotWithMenu = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    isPublic: boolean
    menuId: string | null
    durationMin: number
    menu: Menu | null
}

type Props = {
    year: number
    month: number
    menus: Menu[]
    draftSlots: SlotWithMenu[]
    allSlots: SlotWithMenu[]
}

const TABS = [
    { id: "drafts" as const, label: "1. 編集・確認", icon: List },
    { id: "create" as const, label: "2. 一括作成", icon: Plus },
    { id: "timeline" as const, label: "3. 公開状況確認", icon: BarChart3 },
]

export function SlotManager({ year, month, menus, draftSlots, allSlots }: Props) {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<"create" | "drafts" | "timeline">("drafts")

    const navigateMonth = (delta: number) => {
        let newMonth = month + delta
        let newYear = year
        if (newMonth > 12) { newMonth = 1; newYear++ }
        if (newMonth < 1) { newMonth = 12; newYear-- }
        router.push(`/teacher/slots?year=${newYear}&month=${newMonth}`)
    }

    return (
        <div className="space-y-6">
            {/* Month selector + Tabs */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center rounded-md border bg-slate-50">
                    <Button variant="ghost" className="w-8 h-8 p-0" onClick={() => navigateMonth(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-4 font-bold text-lg min-w-[120px] text-center">
                        {year}年{month}月
                    </span>
                    <Button variant="ghost" className="w-8 h-8 p-0" onClick={() => navigateMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                activeTab === tab.id
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid gap-2 rounded-lg border bg-white p-3 md:grid-cols-3">
                {[
                    { id: "drafts", label: "1. 編集・確認", description: "メニュー/時間を調整して確認" },
                    { id: "create", label: "2. 一括作成", description: "公開前の下書き枠を作る" },
                    { id: "timeline", label: "3. 公開状況確認", description: "公開済みと予約済みを確認" },
                ].map((step) => {
                    const isActive = activeTab === step.id
                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "rounded-md border px-3 py-2 text-xs",
                                isActive ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 bg-slate-50 text-slate-600"
                            )}
                        >
                            <div className="font-bold">{step.label}</div>
                            <div className="mt-0.5">{step.description}</div>
                        </div>
                    )
                })}
            </div>

            {/* Tab Content */}
            {activeTab === "create" && (
                <BatchCreationForm year={year} month={month} menus={menus} />
            )}
            {activeTab === "drafts" && (
                <DraftSlotList draftSlots={draftSlots} menus={menus} />
            )}
            {activeTab === "timeline" && (
                <SlotTimeline slots={allSlots} year={year} month={month} />
            )}
        </div>
    )
}