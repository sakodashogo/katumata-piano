"use client"

import { deleteStudent } from "@/app/lib/actions/student"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

type Student = {
    id: string
    name: string | null
    email: string
    createdAt: Date
}

export function StudentList({ students }: { students: Student[] }) {
    async function handleDelete(id: string) {
        if (confirm("Are you sure you want to delete this student?")) {
            await deleteStudent(id)
        }
    }

    if (students.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
                No students found. Add one to get started!
            </div>
        )
    }

    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                        <th className="px-6 py-3">Name</th>
                        <th className="px-6 py-3">Email</th>
                        <th className="px-6 py-3">Joined</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {students.map((student) => (
                        <tr key={student.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-900">{student.name}</td>
                            <td className="px-6 py-4">{student.email}</td>
                            <td className="px-6 py-4">{new Date(student.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-right">
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(student.id)} className="text-red-500 hover:bg-red-50 hover:text-red-600">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
