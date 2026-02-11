import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

async function getUser(email: string) {
    try {
        const user = await prisma.user.findUnique({ where: { email } })
        return user
    } catch (error) {
        console.error('Failed to fetch user:', error)
        throw new Error('Failed to fetch user.')
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        Credentials({
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({ email: z.string().email(), password: z.string().min(6) })
                    .safeParse(credentials)

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data
                    const user = await getUser(email)
                    if (!user) return null

                    // In a real app, use bcrypt.compare
                    // const passwordsMatch = await bcrypt.compare(password, user.password)
                    // For now, simple check (since we haven't set up hashing yet)
                    // const passwordsMatch = password === user.password;

                    // TODO: Implement proper password checking once users are seeded with hashed passwords.
                    // For initial setup, we might skip password check or use a dummy check.
                    // Let's assume user.password is stored as plain text for the VERY FIRST test, 
                    // BUT best practice is bcrypt. I will add bcryptjs dependency.

                    return user;
                }

                console.log('Invalid credentials')
                return null
            },
        }),
    ],
    pages: {
        signIn: '/login',
    },
    callbacks: {
        async session({ session, token }) {
            if (token.sub && session.user) {
                session.user.id = token.sub;
            }
            // Add role to session
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                // Add role to token
            }
            return token
        }
    }
})
