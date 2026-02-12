"use client"

import Link from "next/link";
import { Button } from "./ui/button";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const teacherLinks = [
    { href: "/teacher/students", label: "生徒管理" },
    { href: "/teacher/schedule", label: "スケジュール" },
    { href: "/teacher/availabilities", label: "空き枠管理" },
    { href: "/teacher/matching", label: "マッチング" },
]

const studentLinks = [
    { href: "/student", label: "ホーム" },
    { href: "/student/availability", label: "空き状況" },
    { href: "/student/book", label: "レッスン予約" },
]

export default function DashboardNav() {
    const { data: session } = useSession();
    const user = session?.user;
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    const isActive = (href: string) => pathname === href || (href !== "/student" && pathname.startsWith(href + "/"))

    const links = user?.role === "TEACHER" ? teacherLinks : studentLinks;

    return (
        <nav className="border-b border-slate-200 bg-white/50 backdrop-blur-md px-6 h-16 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-6">
                <Link href="/dashboard" className="text-xl font-bold tracking-tight text-slate-900">
                    ピアノ教室管理
                </Link>

                {/* Desktop navigation */}
                <div className="hidden md:flex gap-4">
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "text-sm font-medium transition-colors",
                                isActive(link.href)
                                    ? "text-slate-900 border-b-2 border-blue-500 pb-0.5"
                                    : "text-slate-600 hover:text-slate-900"
                            )}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>
            </div>

            <div className="hidden md:flex items-center gap-4">
                <span className="text-sm text-slate-500">
                    {user?.name || user?.email}
                </span>
                <Link href="/settings">
                    <Button variant="ghost" size="sm">設定</Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => signOut()}>ログアウト</Button>
            </div>

            {/* Mobile hamburger */}
            <button
                className="md:hidden p-2 text-slate-600 hover:text-slate-900"
                onClick={() => setMobileOpen(!mobileOpen)}
            >
                {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="absolute top-16 left-0 right-0 bg-white border-b border-slate-200 shadow-lg md:hidden z-50">
                    <div className="flex flex-col p-4 gap-1">
                        {links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    "px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                                    isActive(link.href)
                                        ? "bg-blue-50 text-blue-700"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                {link.label}
                            </Link>
                        ))}
                        <hr className="my-2 border-slate-200" />
                        <div className="px-4 py-2 text-sm text-slate-500">
                            {user?.name || user?.email}
                        </div>
                        <Link
                            href="/settings"
                            onClick={() => setMobileOpen(false)}
                            className="px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                        >
                            設定
                        </Link>
                        <button
                            onClick={() => signOut()}
                            className="px-4 py-3 rounded-lg text-sm font-medium text-left text-slate-600 hover:bg-slate-50"
                        >
                            ログアウト
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}
