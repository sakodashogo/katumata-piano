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
import { useToast } from "@/components/ui/toast"

export function LessonReportDialog({ lesson }: { lesson: any }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const { toast } = useToast()

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        // Add lessonId to formData since it's not in an input
        formData.append("lessonId", lesson.id)

        const res = await updateLessonReport(formData)
        if (res?.success) {
            setOpen(false)
            router.refresh()
        } else {
            toast.error("レポートの保存に失敗しました")
        }
        setLoading(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <FileText className="mr-2 h-4 w-4" />
                    {lesson.report ? "レポート編集" : "レポート作成"}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>レッスンレポート</DialogTitle>
                    <DialogDescription>
                        {new Date(lesson.startTime).toLocaleDateString("ja-JP")} のレッスン記録を更新します。
                    </DialogDescription>
                </DialogHeader>
                <form action={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="report">レッスンメモ</Label>
                            <Textarea
                                id="report"
                                name="report"
                                defaultValue={lesson.report || ""}
                                placeholder="上達した点、課題など"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="homework">宿題</Label>
                            <Textarea
                                id="homework"
                                name="homework"
                                defaultValue={lesson.homework || ""}
                                placeholder="バッハ インヴェンション 第1番 など"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="rating">評価（1-5）</Label>
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
                            保存する
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
