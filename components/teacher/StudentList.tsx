"use client"

import { useState } from "react"
import { deleteStudent, archiveStudent, unarchiveStudent } from "@/app/lib/actions/student"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { Trash2, Archive, RefreshCcw } from "lucide-react" // RefreshCcwを追加
import Link from "next/link"
import { useRouter } from "next/navigation"

export type StudentListItem = {
    id: string
    name: string | null
    email: string
    createdAt: Date
    isArchived?: boolean
}

export function StudentList({ 
    students, 
    isArchivedView = false 
}: { 
    students: StudentListItem[]
    isArchivedView?: boolean
}) {
    const [deleteTarget, setDeleteTarget] = useState<StudentListItem | null>(null)
    const [archiveTarget, setArchiveTarget] = useState<StudentListItem | null>(null)
    const [restoreTarget, setRestoreTarget] = useState<StudentListItem | null>(null) // 復元用
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

    async function handleArchive() {
        if (!archiveTarget) return
        try {
            const result = await archiveStudent(archiveTarget.id)
            if (result.success) {
                toast.success("生徒をアーカイブしました")
                router.refresh()
            } else {
                toast.error(result.error || "アーカイブに失敗しました")
            }
        } catch {
            toast.error("アーカイブに失敗しました")
        }
        setArchiveTarget(null)
    }

    async function handleRestore() {
        if (!restoreTarget) return
        try {
            const result = await unarchiveStudent(restoreTarget.id)
            if (result.success) {
                toast.success("生徒を復元しました")
                router.refresh()
            } else {
                toast.error(result.error || "復元に失敗しました")
            }
        } catch {
            toast.error("復元に失敗しました")
        }
        setRestoreTarget(null)
    }

    if (students.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
                {isArchivedView 
                    ? "アーカイブされた生徒はいません。"
                    : "生徒がまだいません。追加してください。"
                }
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
                                    {isArchivedView ? (
                                        <span className="text-slate-500">{student.name}</span>
                                    ) : (
                                        <Link href={`/teacher/students/${student.id}`} prefetch={false} className="hover:underline text-blue-600">
                                            {student.name}
                                        </Link>
                                    )}
                                </td>
                                <td className="px-6 py-4">{student.email}</td>
                                <td className="px-6 py-4">{new Date(student.createdAt).toLocaleDateString("ja-JP")}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        {isArchivedView ? (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={() => setRestoreTarget(student)} className="text-blue-600 hover:bg-blue-50" aria-label="復元">
                                                    <RefreshCcw className="h-4 w-4 mr-1" />
                                                    復元
                                                </Button>
                                                {/* アーカイブ済みでも完全削除は可能にするかはお好みで */}
                                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(student)} className="text-red-500 hover:bg-red-50 hover:text-red-600" aria-label="完全削除">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(student)} className="text-slate-500 hover:bg-slate-50 hover:text-slate-600" aria-label="アーカイブ">
                                                    <Archive className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(student)} className="text-red-500 hover:bg-red-50 hover:text-red-600" aria-label="削除">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
                title={isArchivedView ? "生徒を完全削除" : "生徒を削除"}
                description={`${deleteTarget?.name || "この生徒"} を削除してもよろしいですか？この操作は取り消せません。`}
                confirmLabel="削除する"
                onConfirm={handleDelete}
                destructive
            />

            <ConfirmDialog
                open={!!archiveTarget}
                onOpenChange={(open) => !open && setArchiveTarget(null)}
                title="生徒をアーカイブ"
                description={`${archiveTarget?.name || "この生徒"} をアーカイブしますか？一覧には表示されなくなります。`}
                confirmLabel="アーカイブする"
                onConfirm={handleArchive}
            />

            <ConfirmDialog
                open={!!restoreTarget}
                onOpenChange={(open) => !open && setRestoreTarget(null)}
                title="生徒を復元"
                description={`${restoreTarget?.name || "この生徒"} を有効な状態に戻しますか？`}
                confirmLabel="復元する"
                onConfirm={handleRestore}
            />
        </>
    )
}
