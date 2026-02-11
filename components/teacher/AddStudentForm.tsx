"use client"

import { useState } from "react"
import { createStudent } from "@/app/lib/actions/student"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, X } from "lucide-react"

export function AddStudentForm() {
    const [isOpen, setIsOpen] = useState(false)
    const [error, setError] = useState("")

    async function handleSubmit(formData: FormData) {
        const result = await createStudent(formData)
        if (result.success) {
            setIsOpen(false)
            setError("")
        } else {
            setError(result.error || "Failed to create student")
        }
    }

    if (!isOpen) {
        return (
            <Button onClick={() => setIsOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Student
            </Button>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900">Add New Student</h2>
                    <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-700">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <form action={handleSubmit} className="space-y-4">
                    <Input name="name" label="Full Name" placeholder="e.g. Alice Smith" required />
                    <Input name="email" label="Email Address" type="email" placeholder="e.g. alice@example.com" required />

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">Create User</Button>
                    </div>
                </form>
            </div>
        </div>
    )
}
