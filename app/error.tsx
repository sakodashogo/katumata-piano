"use client"

import { useEffect } from "react"

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Unhandled app error:", error)
    }, [error])

    return (
        <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900">一時的なエラーが発生しました</h1>
            <p className="text-sm text-slate-600">
                サーバー混雑などでデータ取得に失敗した可能性があります。少し待ってから再試行してください。
            </p>
            <button
                type="button"
                onClick={reset}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
                再試行
            </button>
        </main>
    )
}
