"use client"

import { useState } from "react"
import { updateLessonReport } from "@/app/lib/actions/lesson"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { FileText, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export function LessonReportDialog({ lesson }: { lesson: any }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        // Add lessonId to formData since it's not in an input
        formData.append("lessonId", lesson.id)

        const res = await updateLessonReport(formData)
        if (res?.success) {
            setOpen(false)
            router.refresh()
        } else {
            alert("Failed to update report")
        }
        setLoading(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <FileText className="mr-2 h-4 w-4" />
                    {lesson.report ? "Edit Report" : "Add Report"}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Lesson Report</DialogTitle>
                    <DialogDescription>
                        Update records for the lesson on {new Date(lesson.startTime).toLocaleDateString()}.
                    </DialogDescription>
                </DialogHeader>
                <form action={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="report">Lesson Notes</Label>
                            <Textarea
                                id="report"
                                name="report"
                                defaultValue={lesson.report || ""}
                                placeholder="What was improved? What needs work?"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="homework">Homework</Label>
                            <Textarea
                                id="homework"
                                name="homework"
                                defaultValue={lesson.homework || ""}
                                placeholder="Bach Invention No.1, etc."
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="rating">Rating (1-5)</Label>
                            <Input
                                id="rating"
                                name="rating"
                                type="number"
                                min="1"
                                max="5"
                                defaultValue={lesson.rating || ""}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Report
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
