import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TeacherDashboard() {
    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav />
            <main className="p-6 max-w-7xl mx-auto space-y-6">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Teacher Dashboard</h1>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Upcoming Lessons</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">No lessons scheduled for today.</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Open Slots Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">2 slots available this week.</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Requests</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">0 substitution requests.</p>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
