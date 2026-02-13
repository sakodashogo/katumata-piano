import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

async function getUser(email: string) {
    try {
        const normalizedEmail = normalizeEmail(email)
        const user = await prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
        })
        return user
    } catch (error) {
        console.error('Failed to fetch user:', error)
        throw new Error('Failed to fetch user.')
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    trustHost: true,
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({
                        email: z.preprocess(
                            (value) => typeof value === "string" ? value.trim() : value,
                            z.string().email()
                        ),
                        password: z.string().min(6),
                    })
                    .safeParse(credentials)

                if (parsedCredentials.success) {
                    const { password } = parsedCredentials.data
                    const email = normalizeEmail(parsedCredentials.data.email)
                    console.log("Authorize called for:", email)
                    const user = await getUser(email)
                    if (!user) {
                        console.log("User not found")
                        return null
                    }
                    console.log("User found:", user.id)

                    const passwordsMatch = await bcrypt.compare(password, user.password || "")
                    if (passwordsMatch) return user
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
                session.user.id = token.sub
            }
            if (token.role && session.user) {
                session.user.role = token.role as string
            }
            return session
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                token.role = (user as any).role
            }
            return token
        }
    }
})
