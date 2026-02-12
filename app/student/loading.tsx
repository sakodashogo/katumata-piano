import { Card, CardContent, CardHeader } from "@/components/ui/card"

function Skeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-slate-200 ${className || ""}`} />
}

export default function StudentLoading() {
    return (
        <div className="space-y-8">
            {/* Welcome */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-11 w-36 rounded-xl" />
                    <Skeleton className="h-11 w-36 rounded-xl" />
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Next Lesson */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <Skeleton className="h-5 w-32" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-48" />
                        <Skeleton className="h-5 w-32" />
                    </CardContent>
                </Card>

                {/* Stats */}
                <Card>
                    <CardHeader>
                        <Skeleton className="h-5 w-24" />
                    </CardHeader>
                    <CardContent className="text-center py-4">
                        <Skeleton className="h-8 w-12 mx-auto" />
                        <Skeleton className="h-3 w-24 mx-auto mt-2" />
                    </CardContent>
                </Card>
            </div>

            {/* Upcoming */}
            <div className="space-y-4">
                <Skeleton className="h-6 w-40" />
                <div className="rounded-xl border bg-white divide-y">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-14 w-14 rounded-lg" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-28" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            </div>
                            <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
