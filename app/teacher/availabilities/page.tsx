import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

async function getAvailabilities() {
    return await prisma.availability.findMany({
        include: {
            student: true
        },
        orderBy: { updatedAt: "desc" }
    })
}

const DAYS_MAP: Record<string, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
}

export default async function AvailabilitiesPage() {
    const submissions = await getAvailabilities()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Student Availabilities</h1>
                <p className="text-slate-500">Review schedule preferences submitted by students.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {submissions.map((sub) => (
                    <Card key={sub.id}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{sub.student.name || sub.student.email}</CardTitle>
                            <div className="text-xs text-slate-500">
                                Updated: {new Date(sub.updatedAt).toLocaleDateString()}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <div className="text-sm font-medium mb-2">Preferred Days</div>
                                <div className="flex flex-wrap gap-1">
                                    {(sub.days as string[]).map((day) => (
                                        <Badge key={day} variant="secondary">
                                            {DAYS_MAP[day] || day}
                                        </Badge>
                                    ))}
                                    {(sub.days as string[]).length === 0 && (
                                        <span className="text-sm text-slate-500">No specific days selected</span>
                                    )}
                                </div>
                            </div>
                            {sub.note && (
                                <div>
                                    <div className="text-sm font-medium mb-1">Notes</div>
                                    <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                                        {sub.note}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}

                {submissions.length === 0 && (
                    <div className="col-span-full text-center py-10 text-slate-500">
                        No submissions yet.
                    </div>
                )}
            </div>
        </div>
    )
}
