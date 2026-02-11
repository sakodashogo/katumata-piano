import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const menus = [
        { name: "Regular Lesson", duration: 30, price: 3000, description: "Standard 30-min piano lesson" },
        { name: "Long Lesson", duration: 60, price: 6000, description: "Extended 60-min lesson" },
        { name: "Practice (Room A)", duration: 30, price: 500, description: "Room rental for practice" },
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
