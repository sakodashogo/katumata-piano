import Link from "next/link";
import { Button } from "./ui/button";
import { auth, signOut } from "@/auth";

export default async function DashboardNav() {
    const session = await auth();
    const user = session?.user;

    return (
        <nav className="border-b border-slate-200 bg-white/50 backdrop-blur-md px-6 h-16 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-6">
                <Link href="/dashboard" className="text-xl font-bold tracking-tight text-slate-900">
                    Piano Manager
                </Link>
                {user?.role === "TEACHER" && ( // Assuming generic for now, fix type later
                    <div className="flex gap-4">
                        <Link href="/teacher/students" className="text-sm font-medium text-slate-600 hover:text-slate-900">Students</Link>
                        <Link href="/teacher/schedule" className="text-sm font-medium text-slate-600 hover:text-slate-900">Schedule</Link>
                        <Link href="/teacher/availabilities" className="text-sm font-medium text-slate-600 hover:text-slate-900">Availabilities</Link>
                        <Link href="/teacher/matching" className="text-sm font-medium text-slate-600 hover:text-slate-900">Matching</Link>
                    </div>
                )}
                {user?.role === "STUDENT" && ( // Assuming generic for now
                    <div className="flex gap-4">
                        <Link href="/student" className="text-sm font-medium text-slate-600 hover:text-slate-900">Dashboard</Link>
                        <Link href="/student/availability" className="text-sm font-medium text-slate-600 hover:text-slate-900">Availability</Link>
                        <Link href="/student/book" className="text-sm font-medium text-slate-600 hover:text-slate-900">Book Lesson</Link>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500">
                    {user?.name || user?.email}
                </span>
                <Link href="/settings">
                    <Button variant="ghost" size="sm">Settings</Button>
                </Link>
                <form
                    action={async () => {
                        "use server";
                        await signOut();
                    }}
                >
                    <Button variant="ghost" size="sm">Sign Out</Button>
                </form>
            </div>
        </nav>
    );
}
