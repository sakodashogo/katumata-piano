import DashboardNav from "@/components/DashboardNav"
import { getCachedSession } from "@/lib/session"
import { redirect } from "next/navigation"

export default async function StudentLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await getCachedSession()
    if (!session?.user || session.user.role !== "STUDENT") {
        redirect("/login")
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav user={{ role: "STUDENT", name: session.user.name, email: session.user.email }} />
            <main className="container mx-auto py-8 text-slate-900 px-4">
                {children}
            </main>
        </div>
    )
}
