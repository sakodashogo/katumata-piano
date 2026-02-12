import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    const hashedPassword = await bcrypt.hash('password123', 10)

    const teacher = await prisma.user.upsert({
        where: { email: 'teacher@example.com' },
        update: {},
        create: {
            email: 'teacher@example.com',
            name: 'Teacher Admin',
            password: hashedPassword,
            role: Role.TEACHER,
        },
    })

    console.log({ teacher })

    // Seed Menus
    const menus = [
        { name: "自主練習", durationMin: 30, price: 0, description: "Practice using the piano room." },
        { name: "自主練習 (45分)", durationMin: 45, price: 0, description: "Practice using the piano room (45 min)." },
        { name: "自主練習 (60分)", durationMin: 60, price: 0, description: "Practice using the piano room (60 min)." },
        { name: "ソロの追加レッスン", durationMin: 30, price: 3000, description: "Extra solo lesson." },
        { name: "ソロの追加レッスン (45分)", durationMin: 45, price: 4500, description: "Extra solo lesson (45 min)." },
        { name: "ソロの追加レッスン (60分)", durationMin: 60, price: 6000, description: "Extra solo lesson (60 min)." },
        { name: "連弾の追加レッスン", durationMin: 30, price: 3000, description: "Extra duet lesson." },
        { name: "連弾の追加レッスン (45分)", durationMin: 45, price: 4500, description: "Extra duet lesson (45 min)." },
        { name: "連弾の追加レッスン (60分)", durationMin: 60, price: 6000, description: "Extra duet lesson (60 min)." },
    ]

    for (const menu of menus) {
        await prisma.menu.upsert({
            where: { name: menu.name },
            update: menu,
            create: menu
        })
    }
    console.log("Menus seeded.")

    await prisma.supportStaff.upsert({
        where: { id: "support_a_seed" },
        update: { name: "バイトA", active: true },
        create: { id: "support_a_seed", name: "バイトA", active: true },
    })
    await prisma.supportStaff.upsert({
        where: { id: "support_b_seed" },
        update: { name: "バイトB", active: true },
        create: { id: "support_b_seed", name: "バイトB", active: true },
    })
    console.log("Support staff seeded.")
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
