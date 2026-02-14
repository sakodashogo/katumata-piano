import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value || "", 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const defaultConnectionLimit = parsePositiveInt(process.env.PRISMA_CONNECTION_LIMIT, 3)
const defaultPoolTimeout = parsePositiveInt(process.env.PRISMA_POOL_TIMEOUT, 10)

function withServerlessPoolParams(databaseUrl: string) {
    let url = databaseUrl
    if (!/[?&]connection_limit=/.test(url)) {
        url += `${url.includes("?") ? "&" : "?"}connection_limit=${defaultConnectionLimit}`
    }
    if (!/[?&]pool_timeout=/.test(url)) {
        url += `${url.includes("?") ? "&" : "?"}pool_timeout=${defaultPoolTimeout}`
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
