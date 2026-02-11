import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function StudentDashboard() {
    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav />
            <main className="p-6 max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Dashboard</h1>
                    <Link href="/student/book">
                        <Button>Book Lesson</Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Next Lesson</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">You have no upcoming lessons.</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Practice Stats</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">Keep up the good work!</p>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
