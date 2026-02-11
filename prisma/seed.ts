import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    const hashedPassword = await bcrypt.hash('password123', 10)

    // @ts-ignore
    const teacher = await prisma.user.upsert({
        where: { email: 'teacher@example.com' },
        update: {},
        create: {
            email: 'teacher@example.com',
            name: 'Teacher Admin',
            password: hashedPassword,
            // @ts-ignore
            role: 'TEACHER',
        },
    })

    console.log({ teacher })

    // Seed Menus
    const menus = [
        { name: "自主練 (Practice)", durationMin: 30, price: 0, description: "Practice using the grand piano." },
        { name: "追加レッスン (Solo)", durationMin: 30, price: 2000, description: "Extra solo lesson." },
        { name: "追加レッスン (Duet)", durationMin: 30, price: 2000, description: "Extra duet lesson." },
    ]

    for (const menu of menus) {
        await prisma.menu.create({
            data: menu
        })
    }
    console.log("Menus seeded.")
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
