import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

async function getUser(email: string) {
    const normalizedEmail = normalizeEmail(email)
    return prisma.user.findFirst({
        where: {
            email: {
                equals: normalizedEmail,
                mode: "insensitive",
            },
        },
    })
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
                try {
                    const parsedCredentials = z
                        .object({
                            email: z.preprocess(
                                (value) => typeof value === "string" ? value.trim() : value,
                                z.string().email()
                            ),
                            password: z.string().min(6),
                        })
                        .safeParse(credentials)

                    if (!parsedCredentials.success) {
                        return null
                    }

                    const { password } = parsedCredentials.data
                    const email = normalizeEmail(parsedCredentials.data.email)
                    const user = await getUser(email)
                    if (!user?.password) {
                        return null
                    }

                    const passwordsMatch = await bcrypt.compare(password, user.password)
                    if (!passwordsMatch) {
                        return null
                    }

                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                    }
                } catch (error) {
                    console.error("Credentials authorize failed:", error)
                    return null
                }
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
                const userWithRole = user as typeof user & { role?: string }
                token.id = user.id
                token.role = userWithRole.role
            }
            return token
        }
    }
})
