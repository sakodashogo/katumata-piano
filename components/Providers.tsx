"use client"

import { SessionProvider } from "next-auth/react"
import { ToastProvider, Toaster } from "@/components/ui/toast"

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <ToastProvider>
                {children}
                <Toaster />
            </ToastProvider>
        </SessionProvider>
    )
}
