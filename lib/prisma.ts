import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient
    prismaSupabasePoolerWarningShown?: boolean
}

function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value || "", 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function appendQueryParam(url: string, key: string, value: string) {
    if (new RegExp(`[?&]${key}=`).test(url)) return url
    return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`
}

const isVercelRuntime = process.env.VERCEL === "1"
const isProductionRuntime = process.env.NODE_ENV === "production"
const isServerlessProductionRuntime = isVercelRuntime || isProductionRuntime
const defaultConnectionLimit = parsePositiveInt(
    process.env.PRISMA_CONNECTION_LIMIT,
    isServerlessProductionRuntime ? 1 : 3
)
const defaultPoolTimeout = parsePositiveInt(process.env.PRISMA_POOL_TIMEOUT, 20)

function logSessionToTransactionNormalization(hostname: string, fromPort: string) {
    if (globalForPrisma.prismaSupabasePoolerWarningShown) {
        return
    }
    globalForPrisma.prismaSupabasePoolerWarningShown = true
    console.warn(
        `[prisma] Normalized Supabase pooler from session mode to transaction mode: ${hostname}:${fromPort} -> ${hostname}:6543`
    )
}

function normalizeDatabaseUrl(databaseUrl: string) {
    try {
        const url = new URL(databaseUrl)
        const isSupabasePooler = url.hostname.toLowerCase().endsWith("pooler.supabase.com")
        const isSessionPooler = isSupabasePooler && (url.port === "5432" || url.port === "")

        if (isSessionPooler) {
            const fromPort = url.port || "5432"
            url.port = "6543"
            logSessionToTransactionNormalization(url.hostname, fromPort)
        }

        const isTransactionPooler = isSupabasePooler && url.port === "6543"
        if (isTransactionPooler) {
            // Ensure Prisma uses PgBouncer-compatible mode on Supabase transaction pooler.
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
        let normalizedUrl = databaseUrl
        const isSupabasePooler = /pooler\.supabase\.com/i.test(normalizedUrl)
        const hasSessionModePort = /pooler\.supabase\.com(?::5432)?/i.test(normalizedUrl)

        if (isSupabasePooler && hasSessionModePort) {
            normalizedUrl = normalizedUrl.replace(/(pooler\.supabase\.com)(:5432)?/i, "$1:6543")
            logSessionToTransactionNormalization("pooler.supabase.com", "5432")
        }

        if (isSupabasePooler && !/[?&]pgbouncer=/.test(normalizedUrl)) {
            normalizedUrl = appendQueryParam(normalizedUrl, "pgbouncer", "true")
        }

        const connectionLimit = isSupabasePooler ? 1 : defaultConnectionLimit
        if (!/[?&]connection_limit=/.test(normalizedUrl)) {
            normalizedUrl = appendQueryParam(normalizedUrl, "connection_limit", String(connectionLimit))
        }
        if (!/[?&]pool_timeout=/.test(normalizedUrl)) {
            normalizedUrl = appendQueryParam(normalizedUrl, "pool_timeout", String(defaultPoolTimeout))
        }
        return normalizedUrl
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
