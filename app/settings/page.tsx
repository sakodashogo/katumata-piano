"use client"

import { useEffect, useState } from "react"
import { updateProfile, changePassword } from "@/app/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useSession } from "next-auth/react"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export default function SettingsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [profileLoading, setProfileLoading] = useState(false)
    const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error", text: string } | null>(null)

    const [passwordLoading, setPasswordLoading] = useState(false)
    const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error", text: string } | null>(null)

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/login")
        }
    }, [status, router])

    async function handleProfileUpdate(formData: FormData) {
        setProfileLoading(true)
        setProfileMessage(null)
        const res = await updateProfile(formData)
        if (res?.success) {
            setProfileMessage({ type: "success", text: "プロフィールを更新しました。" })
            router.refresh()
        } else {
            setProfileMessage({ type: "error", text: res?.error || "更新に失敗しました。" })
        }
        setProfileLoading(false)
    }

    async function handlePasswordChange(formData: FormData) {
        setPasswordLoading(true)
        setPasswordMessage(null)
        const res = await changePassword(formData)
        if (res?.success) {
            setPasswordMessage({ type: "success", text: "パスワードを変更しました。" })
            const form = document.getElementById("passwordForm") as HTMLFormElement
            form.reset()
        } else {
            setPasswordMessage({ type: "error", text: res?.error || "パスワードの変更に失敗しました。" })
        }
        setPasswordLoading(false)
    }

    if (status === "loading") return <div className="p-8 text-center">読み込み中...</div>
    if (!session) return <div className="p-8 text-center">ログイン画面へ移動しています...</div>

    return (
        <div className="container max-w-4xl mx-auto py-8 space-y-8">
            <h1 className="text-3xl font-bold text-slate-900">アカウント設定</h1>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Profile Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>プロフィール</CardTitle>
                        <CardDescription>アカウント情報を変更します。</CardDescription>
                    </CardHeader>
                    <form action={handleProfileUpdate}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">氏名</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    defaultValue={session.user?.name || ""}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">メールアドレス</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    defaultValue={session.user?.email || ""}
                                    required
                                />
                            </div>
                            {profileMessage && (
                                <p className={`text-sm ${profileMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                                    {profileMessage.text}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button disabled={profileLoading}>
                                {profileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                変更を保存
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Password Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>パスワード変更</CardTitle>
                        <CardDescription>安全なパスワードを使用してください。</CardDescription>
                    </CardHeader>
                    <form id="passwordForm" action={handlePasswordChange}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="currentPassword">現在のパスワード</Label>
                                <Input id="currentPassword" name="currentPassword" type="password" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">新しいパスワード</Label>
                                <Input id="newPassword" name="newPassword" type="password" minLength={6} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
                                <Input id="confirmPassword" name="confirmPassword" type="password" minLength={6} required />
                            </div>
                            {passwordMessage && (
                                <p className={`text-sm ${passwordMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                                    {passwordMessage.text}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" variant="secondary" disabled={passwordLoading}>
                                {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                パスワードを変更
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    )
}
