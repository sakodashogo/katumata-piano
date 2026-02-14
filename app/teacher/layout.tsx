import DashboardNav from "@/components/DashboardNav"
import { getCachedSession } from "@/lib/session"
import { redirect } from "next/navigation"

export default async function TeacherLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await getCachedSession()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav user={{ role: "TEACHER", name: session.user.name, email: session.user.email }} />
            {children}
        </div>
    )
}
