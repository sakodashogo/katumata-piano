export type AppMenuCategory =
    | "REGULAR"
    | "PRACTICE"
    | "SOLO_ADDITIONAL"
    | "DUET_ADDITIONAL"
    | "OTHER"

export type AppLessonType =
    | "REGULAR"
    | "AD_HOC"
    | "PRACTICE"
    | "SOLO_ADDITIONAL"
    | "DUET_ADDITIONAL"

function normalizeName(name: string) {
    return name.trim().toLowerCase()
}

export function inferMenuCategoryFromName(name: string): AppMenuCategory {
    const normalized = normalizeName(name)

    if (normalized.includes("自主練") || normalized.includes("practice")) return "PRACTICE"
    if (normalized.includes("duet") || normalized.includes("連弾")) return "DUET_ADDITIONAL"
    if (normalized.includes("solo") || normalized.includes("ソロ")) return "SOLO_ADDITIONAL"
    if (normalized.includes("通常") || normalized.includes("regular")) return "REGULAR"
    return "OTHER"
}

export function resolveMenuCategory(menu: { name?: string | null; category?: unknown }): AppMenuCategory {
    const rawCategory = typeof menu.category === "string" ? menu.category.toUpperCase() : ""
    if (
        rawCategory === "REGULAR" ||
        rawCategory === "PRACTICE" ||
        rawCategory === "SOLO_ADDITIONAL" ||
        rawCategory === "DUET_ADDITIONAL" ||
        rawCategory === "OTHER"
    ) {
        return rawCategory
    }

    if (typeof menu.name === "string" && menu.name.length > 0) {
        return inferMenuCategoryFromName(menu.name)
    }

    return "OTHER"
}

export function isStudentBookableCategory(category: AppMenuCategory) {
    return category === "PRACTICE" || category === "SOLO_ADDITIONAL" || category === "DUET_ADDITIONAL"
}

export function isStudentBookableMenu(menu: { name?: string | null; category?: unknown }) {
    return isStudentBookableCategory(resolveMenuCategory(menu))
}

export function toLessonTypeFromMenu(menu: { name?: string | null; category?: unknown }): AppLessonType {
    const category = resolveMenuCategory(menu)
    if (category === "PRACTICE") return "PRACTICE"
    if (category === "SOLO_ADDITIONAL") return "SOLO_ADDITIONAL"
    if (category === "DUET_ADDITIONAL") return "DUET_ADDITIONAL"

    const normalized = menu.name ? normalizeName(menu.name) : ""
    if (normalized.includes("追加") || normalized.includes("ad_hoc") || normalized.includes("ad hoc")) {
        return "AD_HOC"
    }
    return "REGULAR"
}
