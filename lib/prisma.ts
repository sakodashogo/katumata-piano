import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

type SupabasePoolMode = "transaction" | "session"

function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value || "", 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseSupabasePoolMode(value: string | undefined): SupabasePoolMode {
    return value?.trim().toLowerCase() === "session" ? "session" : "transaction"
}

const isVercelRuntime = process.env.VERCEL === "1"
const isProductionRuntime = process.env.NODE_ENV === "production"
const isServerlessProductionRuntime = isVercelRuntime || isProductionRuntime
const defaultConnectionLimit = parsePositiveInt(
    process.env.PRISMA_CONNECTION_LIMIT,
    isServerlessProductionRuntime ? 1 : 3
)
const defaultPoolTimeout = parsePositiveInt(process.env.PRISMA_POOL_TIMEOUT, 20)
const supabasePoolMode = parseSupabasePoolMode(process.env.PRISMA_SUPABASE_POOL_MODE)
const allowSessionPoolModeInServerlessProduction =
    process.env.PRISMA_ALLOW_SESSION_POOL_MODE_IN_PRODUCTION === "1"

function normalizeDatabaseUrl(databaseUrl: string) {
    try {
        const url = new URL(databaseUrl)
        const isSupabasePooler = url.hostname.endsWith("pooler.supabase.com")
        const isSessionPooler = isSupabasePooler && (url.port === "5432" || url.port === "")
        const forceTransactionPoolerByEnv = process.env.PRISMA_FORCE_TRANSACTION_MODE === "1"
        const shouldUseSessionMode =
            supabasePoolMode === "session" &&
            (!isServerlessProductionRuntime || allowSessionPoolModeInServerlessProduction)
        const shouldPreferTransactionPooler =
            !shouldUseSessionMode &&
            (isSupabasePooler || forceTransactionPoolerByEnv || isServerlessProductionRuntime)

        if (isSessionPooler && shouldPreferTransactionPooler) {
            // On serverless, transaction mode avoids Supabase session-mode client ceilings.
            url.port = "6543"
        }

        const isTransactionPooler = isSupabasePooler && url.port === "6543"
        if (isTransactionPooler && !url.searchParams.has("pgbouncer")) {
            url.searchParams.set("pgbouncer", "true")
        }

        // Keep Prisma's pool tiny on Supabase pooler to minimize concurrent backend sessions.
        const connectionLimit = isSupabasePooler ? 1 : defaultConnectionLimit

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
