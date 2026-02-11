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

const DAYS = [
    { id: "monday", label: "Monday" },
    { id: "tuesday", label: "Tuesday" },
    { id: "wednesday", label: "Wednesday" },
    { id: "thursday", label: "Thursday" },
    { id: "friday", label: "Friday" },
    { id: "saturday", label: "Saturday" },
    { id: "sunday", label: "Sunday" },
]

export function AvailabilityForm({ initialData }: { initialData?: any }) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        const res = await saveAvailability(formData)
        if (res?.success) {
            alert("Availability saved!")
            router.refresh()
        } else {
            alert("Failed to save.")
        }
        setLoading(false)
    }

    // Checking if a day is selected in initialData (assuming JSON array of strings)
    const isChecked = (dayId: string) => {
        if (!initialData?.days) return false
        return (initialData.days as string[]).includes(dayId)
    }

    return (
        <form action={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle>Lesson Availability Preference</CardTitle>
                    <CardDescription>
                        Select the days you are generally available for lessons.
                        Use the notes section for specific times (e.g., "After 4 PM").
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
                        <Label htmlFor="note">Additional Notes</Label>
                        <Textarea
                            id="note"
                            name="note"
                            placeholder="e.g. Prefer 16:30 - 18:00. Unavailable during school holidays."
                            defaultValue={initialData?.note || ""}
                            className="min-h-[100px]"
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button disabled={loading} className="w-full md:w-auto">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        Save Preferences
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
