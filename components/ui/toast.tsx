"use client"

import * as React from "react"
import { createContext, useCallback, useContext, useState } from "react"
import { cn } from "@/lib/utils"
import { XIcon, CheckCircle2, AlertCircle, Info } from "lucide-react"

type ToastType = "success" | "error" | "info"

interface Toast {
    id: string
    message: string
    type: ToastType
}

interface ToastContextType {
    toasts: Toast[]
    toast: {
        success: (message: string) => void
        error: (message: string) => void
        info: (message: string) => void
    }
    removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback((message: string, type: ToastType) => {
        const id = Math.random().toString(36).substring(2, 9)
        setToasts((prev) => [...prev, { id, message, type }])

        // Auto-remove after 4 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id))
        }, 4000)
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const toast = React.useMemo(() => ({
        success: (message: string) => addToast(message, "success"),
        error: (message: string) => addToast(message, "error"),
        info: (message: string) => addToast(message, "info"),
    }), [addToast])

    return (
        <ToastContext.Provider value={{ toasts, toast, removeToast }}>
            {children}
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        // This should not happen if properly wrapped, but during SSR/development specific conditions it might verify checks.
        console.error("useToast must be used within a ToastProvider")
        return {
            toasts: [],
            toast: {
                success: (msg: string) => console.log("Toast (Success):", msg),
                error: (msg: string) => console.error("Toast (Error):", msg),
                info: (msg: string) => console.log("Toast (Info):", msg),
            },
            removeToast: () => { },
        }
    }
    return context

}

const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
}

const bgColors: Record<ToastType, string> = {
    success: "border-green-200 bg-green-50",
    error: "border-red-200 bg-red-50",
    info: "border-blue-200 bg-blue-50",
}

export function Toaster() {
    const { toasts, removeToast } = useToast()

    if (toasts.length === 0) return null

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={cn(
                        "flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right-5 fade-in duration-300",
                        bgColors[toast.type]
                    )}
                >
                    {icons[toast.type]}
                    <p className="text-sm font-medium text-slate-900 flex-1">{toast.message}</p>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                    >
                        <XIcon className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </div>
    )
}
