"use client"

import { useState, type FormEvent } from "react"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { updateStudent } from "@/app/lib/actions/student"
import { Loader2, Pencil } from "lucide-react"
import { useRouter } from "next/navigation"

const formSchema = z.object({
    name: z.string().trim().min(1, "名前は必須です"),
    email: z.string().trim().email("有効なメールアドレスを入力してください"),
    defaultLessonCount: z.number().int().min(1, "1回以上を指定してください"),
})

type Props = {
    student: {
        id: string
        name: string | null
        email: string
        defaultLessonCount: number
    }
}

type FormState = {
    name: string
    email: string
    defaultLessonCount: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

export function StudentEditDialog({ student }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errors, setErrors] = useState<FormErrors>({})
    const [formState, setFormState] = useState<FormState>({
        name: student.name || "",
        email: student.email,
        defaultLessonCount: String(student.defaultLessonCount),
    })
    const { toast } = useToast()

    const resetForm = () => {
        setFormState({
            name: student.name || "",
            email: student.email,
            defaultLessonCount: String(student.defaultLessonCount),
        })
        setErrors({})
    }

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setErrors({})

        const parsed = formSchema.safeParse({
            name: formState.name,
            email: formState.email,
            defaultLessonCount: Number(formState.defaultLessonCount),
        })

        if (!parsed.success) {
            const fieldErrors = parsed.error.flatten().fieldErrors
            setErrors({
                name: fieldErrors.name?.[0],
                email: fieldErrors.email?.[0],
                defaultLessonCount: fieldErrors.defaultLessonCount?.[0],
            })
            return
        }

        const formData = new FormData()
        formData.append("name", parsed.data.name)
        formData.append("email", parsed.data.email)
        formData.append("defaultLessonCount", parsed.data.defaultLessonCount.toString())

        setIsSubmitting(true)
        const result = await updateStudent(student.id, formData)
        if (result.success) {
            toast.success("生徒情報を更新しました")
            setOpen(false)
            router.refresh()
        } else {
            toast.error(result.error || "更新に失敗しました")
        }
        setIsSubmitting(false)
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen)
                if (nextOpen) {
                    resetForm()
                }
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Pencil className="mr-2 h-4 w-4" />
                    編集
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>生徒情報の編集</DialogTitle>
                    <DialogDescription>
                        生徒の基本情報を変更します。
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="student-name">名前</Label>
                        <Input
                            id="student-name"
                            value={formState.name}
                            onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                        />
                        {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="student-email">メールアドレス</Label>
                        <Input
                            id="student-email"
                            value={formState.email}
                            onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                        />
                        {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="student-lesson-count">月間レッスン契約回数</Label>
                        <Input
                            id="student-lesson-count"
                            type="number"
                            min={1}
                            value={formState.defaultLessonCount}
                            onChange={(event) => setFormState((prev) => ({ ...prev, defaultLessonCount: event.target.value }))}
                        />
                        {errors.defaultLessonCount && <p className="text-sm text-red-600">{errors.defaultLessonCount}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
