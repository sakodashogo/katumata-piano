import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function withServerlessPoolParams(databaseUrl: string) {
    let url = databaseUrl
    if (!/[?&]connection_limit=/.test(url)) {
        url += `${url.includes("?") ? "&" : "?"}connection_limit=1`
    }
    if (!/[?&]pool_timeout=/.test(url)) {
        url += `${url.includes("?") ? "&" : "?"}pool_timeout=20`
    }
    return url
}

const prismaDatasourceUrl = process.env.DATABASE_URL
    ? withServerlessPoolParams(process.env.DATABASE_URL)
    : undefined

const prismaClient = new PrismaClient(
    prismaDatasourceUrl
        ? {
            datasources: {
                db: {
                    url: prismaDatasourceUrl,
                },
            },
        }
        : undefined
)

export const prisma = globalForPrisma.prisma || prismaClient

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
