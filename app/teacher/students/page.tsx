import { Suspense } from "react"
import { getStudents } from "@/app/lib/actions/student"
import { StudentList } from "@/components/teacher/StudentList"
import { AddStudentForm } from "@/components/teacher/AddStudentForm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"

export default async function StudentsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const isArchivedView = params.view === "archived"

    // 選択されたタブに応じてデータを取得
    const { data: students, success } = await getStudents(isArchivedView)

    if (!success || !students) {
        return <div>Failed to load students</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">生徒管理</h1>
                    <p className="text-muted-foreground">
                        生徒の追加、編集、アーカイブ管理を行います。
                    </p>
                </div>
                {!isArchivedView && <AddStudentForm />}
            </div>

            <Tabs defaultValue={isArchivedView ? "archived" : "active"} className="w-full">
                <TabsList>
                    <Link href="/teacher/students">
                        <TabsTrigger value="active">有効な生徒</TabsTrigger>
                    </Link>
                    <Link href="/teacher/students?view=archived">
                        <TabsTrigger value="archived">アーカイブ済み</TabsTrigger>
                    </Link>
                </TabsList>
            </Tabs>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {isArchivedView ? "アーカイブ済みの生徒" : "生徒一覧"}
                    </CardTitle>
                    <CardDescription>
                        {isArchivedView 
                            ? "過去にアーカイブされた生徒のリストです。ここから復元できます。"
                            : "現在アクティブな生徒のリストです。"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<div>Loading...</div>}>
                        <StudentList students={students} isArchivedView={isArchivedView} />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    )
}