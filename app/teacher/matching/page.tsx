import { findMatches } from "@/app/lib/actions/matching"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format } from "date-fns"

export default async function MatchingPage() {
    const { matches, openSlots } = await findMatches()

    return (
        <div className="container max-w-6xl mx-auto py-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Schedule Matching</h1>
                    <p className="text-slate-500">
                        Automatically find compatible students for available slots (Next Week Preview).
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Available Slots List */}
                <div className="lg:col-span-1 space-y-4">
                    <h2 className="text-xl font-semibold">Available Slots</h2>
                    <ScrollArea className="h-[600px] rounded-md border p-4">
                        <div className="space-y-4">
                            {openSlots.map((slot) => (
                                <div key={slot.id} className="p-3 bg-white border rounded shadow-sm">
                                    <div className="font-medium text-slate-800">
                                        {format(slot.startTime, "EEEE, MMMM d")}
                                    </div>
                                    <div className="text-sm text-slate-500">
                                        {format(slot.startTime, "HH:mm")} - {format(slot.endTime, "HH:mm")}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* Matches Visualization */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-semibold">Suggested Assignments</h2>
                    <div className="grid gap-4">
                        {matches.length === 0 && (
                            <div className="p-8 text-center border rounded border-dashed text-slate-400">
                                No direct matches found between open slots and student preferences.
                            </div>
                        )}
                        {matches.map((match: any, i: number) => (
                            <Card key={i} className="border-l-4 border-l-blue-500">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle>
                                                {format(match.slot.startTime, "EEEE HH:mm")}
                                            </CardTitle>
                                            <CardDescription>
                                                {format(match.slot.startTime, "MMMM d")}
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                            {match.students.length} Candidates
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {match.students.map((student: any) => (
                                            <div key={student.id} className="flex justify-between items-center p-2 bg-slate-50 rounded">
                                                <div>
                                                    <div className="font-medium">{student.name}</div>
                                                    <div className="text-xs text-slate-500">{student.email}</div>
                                                </div>
                                                <Button size="sm" variant="secondary">
                                                    Assign Slot
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
