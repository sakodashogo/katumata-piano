import DashboardNav from "@/components/DashboardNav"

export default function TeacherLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav />
            {children}
        </div>
    )
}
