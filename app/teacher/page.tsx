import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TeacherDashboard() {
    return (
        <div className="min-h-screen bg-slate-50">
            <DashboardNav />
            <main className="p-6 max-w-7xl mx-auto space-y-6">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">講師ダッシュボード</h1>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>今後のレッスン</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">本日のレッスンはありません。</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>空き枠の状況</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">今週は2枠の空きがあります。</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>保留中のリクエスト</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">0 件の振替リクエスト</p>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
