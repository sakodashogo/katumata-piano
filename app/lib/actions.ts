'use server'

import { signIn } from '@/auth'
import { AuthError } from 'next-auth'
import { isRedirectError } from "next/dist/client/components/redirect-error"

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', {
            ...Object.fromEntries(formData),
            redirectTo: '/dashboard',
        })
    } catch (error) {
        if (isRedirectError(error)) {
            throw error
        }

        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.'
                default:
                    return 'Something went wrong.'
            }
        }
        console.error("Authenticate action failed:", error)
        return "Something went wrong."
    }
}
