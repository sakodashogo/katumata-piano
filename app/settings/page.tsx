"use client"

import { useState } from "react"
import { updateProfile, changePassword } from "@/app/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { useSession } from "next-auth/react"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export default function SettingsPage() {
    const { data: session } = useSession()
    const router = useRouter()

    // Profile State
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileMessage, setProfileMessage] = useState("")

    // Password State
    const [passwordLoading, setPasswordLoading] = useState(false)
    const [passwordMessage, setPasswordMessage] = useState("")

    async function handleProfileUpdate(formData: FormData) {
        setProfileLoading(true)
        setProfileMessage("")
        const res = await updateProfile(formData)
        if (res?.success) {
            setProfileMessage("Profile updated successfully.")
            router.refresh()
        } else {
            setProfileMessage(res?.error || "Failed to update.")
        }
        setProfileLoading(false)
    }

    async function handlePasswordChange(formData: FormData) {
        setPasswordLoading(true)
        setPasswordMessage("")
        const res = await changePassword(formData)
        if (res?.success) {
            setPasswordMessage("Password changed successfully.")
            // Optional: reset form
            const form = document.getElementById("passwordForm") as HTMLFormElement
            form.reset()
        } else {
            setPasswordMessage(res?.error || "Failed to change password.")
        }
        setPasswordLoading(false)
    }

    if (!session) return <div className="p-8 text-center">Loading...</div>

    return (
        <div className="container max-w-4xl mx-auto py-8 space-y-8">
            <h1 className="text-3xl font-bold text-slate-900">Account Settings</h1>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Profile Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>Profile Information</CardTitle>
                        <CardDescription>Update your account details.</CardDescription>
                    </CardHeader>
                    <form action={handleProfileUpdate}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    defaultValue={session.user?.name || ""}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    defaultValue={session.user?.email || ""}
                                    required
                                />
                            </div>
                            {profileMessage && (
                                <p className={`text-sm ${profileMessage.includes("success") ? "text-green-600" : "text-red-600"}`}>
                                    {profileMessage}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button disabled={profileLoading}>
                                {profileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Password Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>Change Password</CardTitle>
                        <CardDescription>Ensure your account is using a long, random password to stay secure.</CardDescription>
                    </CardHeader>
                    <form id="passwordForm" action={handlePasswordChange}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="currentPassword">Current Password</Label>
                                <Input id="currentPassword" name="currentPassword" type="password" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input id="newPassword" name="newPassword" type="password" minLength={6} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                <Input id="confirmPassword" name="confirmPassword" type="password" minLength={6} required />
                            </div>
                            {passwordMessage && (
                                <p className={`text-sm ${passwordMessage.includes("success") ? "text-green-600" : "text-red-600"}`}>
                                    {passwordMessage}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" variant="secondary" disabled={passwordLoading}>
                                {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Change Password
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    )
}
