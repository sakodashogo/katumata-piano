import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const menus = [
        { name: "通常レッスン", durationMin: 30, price: 3000, description: "30分のピアノレッスン" },
        { name: "追加レッスン", durationMin: 60, price: 6000, description: "60分の追加レッスン" },
        { name: "自主練（A教室）", durationMin: 30, price: 500, description: "練習室レンタル" },
    ]

    for (const menu of menus) {
        // @ts-ignore
        await prisma.menu.upsert({
            where: { name: menu.name } as any, // Cast to any if name unique constraint isn't perfect in type
            update: {},
            create: menu,
        })
    }

    console.log("Menus seeded!")
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
