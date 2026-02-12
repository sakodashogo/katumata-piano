import DashboardNav from "@/components/DashboardNav"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function TeacherLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav />
            {children}
        </div>
    )
}
