import DashboardNav from "@/components/DashboardNav"

export default function StudentLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav />
            <main className="container mx-auto py-8 text-slate-900 px-4">
                {children}
            </main>
        </div>
    )
}
