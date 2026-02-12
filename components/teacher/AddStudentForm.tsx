"use client"

import { useState } from "react"
import { createStudent } from "@/app/lib/actions/student"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"

export function AddStudentForm() {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState("")

    const closeForm = () => {
        if (isSubmitting) return
        setIsOpen(false)
        setError("")
    }

    async function handleSubmit(formData: FormData) {
        setIsSubmitting(true)
        setError("")
        const result = await createStudent(formData)
        if (result.success) {
            setIsOpen(false)
            router.refresh()
        } else {
            setError(result.error || "生徒の追加に失敗しました")
        }
        setIsSubmitting(false)
    }

    if (!isOpen) {
        return (
            <Button onClick={() => setIsOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> 生徒を追加
            </Button>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900">生徒を追加</h2>
                    <button onClick={closeForm} className="text-slate-500 hover:text-slate-700" type="button">
                        <X className="h-6 w-6" />
                    </button>
                </div>
                <p className="mb-4 text-xs text-slate-500">初期パスワードは piano123 で作成されます。</p>

                <form action={handleSubmit} className="space-y-4">
                    <Input name="name" placeholder="氏名" required />
                    <Input name="email" type="email" placeholder="メールアドレス" required />
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">月間レッスン回数（契約）</label>
                        <Input name="defaultLessonCount" type="number" min={1} defaultValue={4} required />
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="ghost" onClick={closeForm} disabled={isSubmitting}>
                            キャンセル
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            追加する
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}
