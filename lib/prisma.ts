import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value || "", 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const isVercelRuntime = process.env.VERCEL === "1"
const isProductionRuntime = process.env.NODE_ENV === "production"
const defaultConnectionLimit = parsePositiveInt(
    process.env.PRISMA_CONNECTION_LIMIT,
    isVercelRuntime || isProductionRuntime ? 1 : 3
)
const defaultPoolTimeout = parsePositiveInt(process.env.PRISMA_POOL_TIMEOUT, 20)
const forceTransactionPooler = process.env.PRISMA_SUPABASE_POOL_MODE !== "session"

function normalizeDatabaseUrl(databaseUrl: string) {
    try {
        const url = new URL(databaseUrl)
        const isSupabasePooler = url.hostname.endsWith("pooler.supabase.com")
        const isSessionPooler = isSupabasePooler && (url.port === "5432" || url.port === "")
        const shouldPreferTransactionPooler =
            forceTransactionPooler &&
            (isVercelRuntime || isProductionRuntime || process.env.PRISMA_FORCE_TRANSACTION_MODE === "1")

        if (isSessionPooler && shouldPreferTransactionPooler) {
            // Supabase session mode can hit connection ceilings quickly on serverless workloads.
            url.port = "6543"
        }

        const isTransactionPooler = isSupabasePooler && url.port === "6543"
        if (isTransactionPooler && !url.searchParams.has("pgbouncer")) {
            url.searchParams.set("pgbouncer", "true")
        }

        const connectionLimit =
            isSupabasePooler && (isVercelRuntime || isProductionRuntime) ? 1 : defaultConnectionLimit

        if (!url.searchParams.has("connection_limit")) {
            url.searchParams.set("connection_limit", String(connectionLimit))
        }
        if (!url.searchParams.has("pool_timeout")) {
            url.searchParams.set("pool_timeout", String(defaultPoolTimeout))
        }

        return url.toString()
    } catch {
        let url = databaseUrl
        if (!/[?&]connection_limit=/.test(url)) {
            url += `${url.includes("?") ? "&" : "?"}connection_limit=${defaultConnectionLimit}`
        }
        if (!/[?&]pool_timeout=/.test(url)) {
            url += `${url.includes("?") ? "&" : "?"}pool_timeout=${defaultPoolTimeout}`
        }
        return url
    }
}

const prismaDatasourceUrl = process.env.DATABASE_URL
    ? normalizeDatabaseUrl(process.env.DATABASE_URL)
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
