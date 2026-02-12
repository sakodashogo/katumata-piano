import { SlotManager } from "@/components/teacher/SlotManager"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { isStudentBookableMenu } from "@/lib/menu-category"

type SlotManagerMenu = {
    id: string
    name: string
    durationMin: number
    price: number
    description: string | null
}

type SlotManagerSlot = {
    id: string
    roomId: string
    startTime: Date
    endTime: Date
    isBooked: boolean
    isPublic: boolean
    menuId: string | null
    durationMin: number
    menu: SlotManagerMenu | null
}

function getSingleParam(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
        return value[0]
    }
    return value
}

export default async function SlotsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await auth()
    if (!session?.user || session.user.role !== "TEACHER") {
        redirect("/login")
    }

    const params = await searchParams
    const yearParam = getSingleParam(params.year)
    const monthParam = getSingleParam(params.month)
    const hasExplicitMonthSelection = Boolean(yearParam || monthParam)
    const now = new Date()
    const initialYear = Number(yearParam) || now.getFullYear()
    const initialMonth = Number(monthParam) || now.getMonth() + 1

    const getMonthRange = (year: number, month: number) => ({
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 0, 23, 59, 59, 999),
    })

    const loadMonthData = async (year: number, month: number) => {
        const { start, end } = getMonthRange(year, month)
        const menusRaw = await prisma.menu.findMany({
            select: {
                id: true,
                name: true,
                durationMin: true,
                price: true,
                description: true,
            },
            orderBy: [{ price: "asc" }, { durationMin: "asc" }],
        })

        let slotsRaw: Array<Record<string, unknown>>
        try {
            slotsRaw = await prisma.openSlot.findMany({
                where: {
                    startTime: { gte: start, lte: end },
                },
                include: {
                    menu: {
                        select: {
                            id: true,
                            name: true,
                            durationMin: true,
                            price: true,
                            description: true,
                        },
                    },
                },
                orderBy: { startTime: "asc" },
            }) as Array<Record<string, unknown>>
        } catch (error) {
            const message = error instanceof Error ? error.message : ""
            if (!message.includes("Unknown field `menu`")) {
                throw error
            }
            slotsRaw = await prisma.openSlot.findMany({
                where: {
                    startTime: { gte: start, lte: end },
                },
                orderBy: { startTime: "asc" },
            }) as Array<Record<string, unknown>>
        }

        const normalizeMenu = (menu: {
            id: string
            name: string
            durationMin: number
            price: number
            description: string | null
        }): SlotManagerMenu => ({
            id: menu.id,
            name: menu.name,
            durationMin: menu.durationMin,
            price: menu.price,
            description: menu.description,
        })

        const allMenusForJoin = menusRaw.map(normalizeMenu)
        const menuById = new Map(allMenusForJoin.map((menu) => [menu.id, menu]))
        const menus = menusRaw
            .filter((menu) => isStudentBookableMenu(menu as { name?: string | null; category?: unknown }))
            .map(normalizeMenu)

        const allSlots: SlotManagerSlot[] = slotsRaw
            .map((slot): SlotManagerSlot | null => {
                const id = typeof slot.id === "string" ? slot.id : null
                const roomId = typeof slot.roomId === "string" ? slot.roomId : null
                if (!id || !roomId) return null

                const startTime = slot.startTime instanceof Date ? slot.startTime : new Date(String(slot.startTime))
                const endTime = slot.endTime instanceof Date ? slot.endTime : new Date(String(slot.endTime))
                if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return null

                const menuId = typeof slot.menuId === "string" ? slot.menuId : null
                const embeddedMenu = (slot as { menu?: unknown }).menu
                let normalizedEmbeddedMenu: SlotManagerMenu | null = null
                if (embeddedMenu && typeof embeddedMenu === "object") {
                    const menu = embeddedMenu as Record<string, unknown>
                    if (
                        typeof menu.id === "string" &&
                        typeof menu.name === "string" &&
                        typeof menu.durationMin === "number" &&
                        typeof menu.price === "number"
                    ) {
                        normalizedEmbeddedMenu = {
                            id: menu.id,
                            name: menu.name,
                            durationMin: menu.durationMin,
                            price: menu.price,
                            description: typeof menu.description === "string" ? menu.description : null,
                        }
                    }
                }

                const resolvedMenu = normalizedEmbeddedMenu ?? (menuId ? menuById.get(menuId) ?? null : null)

                return {
                    id,
                    roomId,
                    menuId,
                    durationMin: typeof slot.durationMin === "number" ? slot.durationMin : 30,
                    menu: resolvedMenu,
                    startTime,
                    endTime,
                    isBooked: Boolean(slot.isBooked),
                    isPublic: Boolean(slot.isPublic),
                }
            })
            .filter((slot): slot is SlotManagerSlot => slot !== null)
        const draftSlots = allSlots.filter((slot) => !slot.isBooked && !slot.isPublic)

        return { menus, allSlots, draftSlots }
    }

    let year = initialYear
    let month = initialMonth
    let { menus, allSlots, draftSlots } = await loadMonthData(year, month)

    if (!hasExplicitMonthSelection && draftSlots.length === 0) {
        const { start } = getMonthRange(year, month)
        const nearestDraft =
            await prisma.openSlot.findFirst({
                where: {
                    isPublic: false,
                    isBooked: false,
                    startTime: { gte: start },
                },
                orderBy: { startTime: "asc" },
                select: { startTime: true },
            }) ??
            await prisma.openSlot.findFirst({
                where: {
                    isPublic: false,
                    isBooked: false,
                    startTime: { lt: start },
                },
                orderBy: { startTime: "desc" },
                select: { startTime: true },
            })

        if (nearestDraft) {
            year = nearestDraft.startTime.getFullYear()
            month = nearestDraft.startTime.getMonth() + 1
            const reloaded = await loadMonthData(year, month)
            menus = reloaded.menus
            allSlots = reloaded.allSlots
            draftSlots = reloaded.draftSlots
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">空き枠承認</h1>
                <p className="text-slate-500">下書きの作成・編集・公開を段階的に管理します。</p>
            </div>

            <SlotManager
                year={year}
                month={month}
                menus={menus}
                draftSlots={draftSlots}
                allSlots={allSlots}
            />
        </div>
    )
}
