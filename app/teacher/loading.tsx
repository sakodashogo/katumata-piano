import { Card, CardContent, CardHeader } from "@/components/ui/card"

function Skeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-slate-200 ${className || ""}`} />
}

export default function TeacherLoading() {
    return (
        <div className="min-h-screen bg-slate-50">
            {/* Nav placeholder */}
            <div className="border-b bg-white px-6 py-4">
                <Skeleton className="h-6 w-48" />
            </div>

            <main className="p-6 max-w-7xl mx-auto space-y-6">
                <Skeleton className="h-8 w-56" />

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Card key={i}>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-9 w-9 rounded-lg" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-3 w-20" />
                                        <Skeleton className="h-7 w-12" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Today */}
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-4 w-28" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="h-5 w-12" />
                                        <div className="space-y-1">
                                            <Skeleton className="h-4 w-24" />
                                            <Skeleton className="h-3 w-16" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-5 w-14 rounded-full" />
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Upcoming */}
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-4 w-32" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="h-8 w-12" />
                                        <div className="space-y-1">
                                            <Skeleton className="h-4 w-24" />
                                            <Skeleton className="h-3 w-16" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
