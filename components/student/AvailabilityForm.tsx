"use client"

import { useState } from "react"
import { saveAvailability } from "@/app/lib/actions/availability"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"

const DAYS = [
    { id: "monday", label: "月曜日" },
    { id: "tuesday", label: "火曜日" },
    { id: "wednesday", label: "水曜日" },
    { id: "thursday", label: "木曜日" },
    { id: "friday", label: "金曜日" },
    { id: "saturday", label: "土曜日" },
    { id: "sunday", label: "日曜日" },
]

export function AvailabilityForm({ initialData }: { initialData?: any }) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const { toast } = useToast()

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        const res = await saveAvailability(formData)
        if (res?.success) {
            toast.success("保存しました")
            router.refresh()
        } else {
            toast.error("保存に失敗しました")
        }
        setLoading(false)
    }

    const isChecked = (dayId: string) => {
        if (!initialData?.days) return false
        return (initialData.days as string[]).includes(dayId)
    }

    return (
        <form action={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle>レッスン希望曜日</CardTitle>
                    <CardDescription>
                        レッスン可能な曜日を選択してください。備考欄に希望時間帯等を記入できます。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {DAYS.map((day) => (
                            <div key={day.id} className="flex items-center space-x-2 border p-3 rounded-md">
                                <Checkbox
                                    id={day.id}
                                    name="days"
                                    value={day.id}
                                    defaultChecked={isChecked(day.id)}
                                />
                                <Label htmlFor={day.id} className="cursor-pointer font-medium">
                                    {day.label}
                                </Label>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="note">備考</Label>
                        <Textarea
                            id="note"
                            name="note"
                            placeholder="例: 16:30〜18:00 希望。学校の長期休暇中は不可。"
                            defaultValue={initialData?.note || ""}
                            className="min-h-[100px]"
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button disabled={loading} className="w-full md:w-auto">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        保存する
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
