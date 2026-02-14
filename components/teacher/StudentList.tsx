"use client"

import { useState } from "react"
import { deleteStudent } from "@/app/lib/actions/student"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export type StudentListItem = {
    id: string
    name: string | null
    email: string
    createdAt: Date
}

export function StudentList({ students }: { students: StudentListItem[] }) {
    const [deleteTarget, setDeleteTarget] = useState<StudentListItem | null>(null)
    const { toast } = useToast()
    const router = useRouter()

    async function handleDelete() {
        if (!deleteTarget) return
        try {
            const result = await deleteStudent(deleteTarget.id)
            if (result.success) {
                toast.success("生徒を削除しました")
                router.refresh()
            } else {
                toast.error(result.error || "削除に失敗しました")
            }
        } catch {
            toast.error("削除に失敗しました")
        }
        setDeleteTarget(null)
    }

    if (students.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
                生徒がまだいません。追加してください。
            </div>
        )
    }

    return (
        <>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                        <tr>
                            <th className="px-6 py-3">氏名</th>
                            <th className="px-6 py-3">メール</th>
                            <th className="px-6 py-3">登録日</th>
                            <th className="px-6 py-3 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {students.map((student) => (
                            <tr key={student.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4 font-medium text-slate-900">
                                    <Link href={`/teacher/students/${student.id}`} prefetch={false} className="hover:underline text-blue-600">
                                        {student.name}
                                    </Link>
                                </td>
                                <td className="px-6 py-4">{student.email}</td>
                                <td className="px-6 py-4">{new Date(student.createdAt).toLocaleDateString("ja-JP")}</td>
                                <td className="px-6 py-4 text-right">
                                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(student)} className="text-red-500 hover:bg-red-50 hover:text-red-600" aria-label={`${student.name || "生徒"}を削除`}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title="生徒を削除"
                description={`${deleteTarget?.name || "この生徒"} を削除してもよろしいですか？この操作は取り消せません。`}
                confirmLabel="削除する"
                onConfirm={handleDelete}
                destructive
            />
        </>
    )
}
