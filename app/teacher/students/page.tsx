import { getStudents } from "@/app/lib/actions/student"
import { AddStudentForm } from "@/components/teacher/AddStudentForm"
import { StudentList } from "@/components/teacher/StudentList"

export default async function StudentManagementPage() {
    const { data: students = [] } = await getStudents()

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">生徒管理</h1>
                    <p className="text-slate-500">生徒一覧と管理</p>
                </div>
                <AddStudentForm />
            </div>

            <StudentList students={students as any} />
        </div>
    )
}
