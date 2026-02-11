'use client'

import { useFormStatus } from 'react-dom'
import { authenticate } from '@/app/lib/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActionState } from 'react'

function LoginButton() {
    const { pending } = useFormStatus()

    return (
        <Button className="w-full mt-4" disabled={pending}>
            {pending ? 'Logging in...' : 'Login'}
        </Button>
    )
}

export default function LoginForm() {
    const [errorMessage, dispatch] = useActionState(authenticate, undefined)

    return (
        <form action={dispatch} className="space-y-4">
            <Input
                type="email"
                name="email"
                placeholder="Email"
                required
                label="Email"
            />
            <Input
                type="password"
                name="password"
                placeholder="Password"
                required
                minLength={6}
                label="Password"
            />
            <LoginButton />
            {errorMessage && (
                <p className="text-sm text-red-500 font-medium text-center">{errorMessage}</p>
            )}
        </form>
    )
}
