"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { updateStudent } from "@/app/lib/actions/student"
import { Pencil } from "lucide-react"

const formSchema = z.object({
    name: z.string().min(1, "名前は必須です"),
    email: z.string().email("有効なメールアドレスを入力してください"),
    defaultLessonCount: z.coerce.number().min(1, "1回以上を指定してください"),
})

type Props = {
    student: {
        id: string
        name: string | null
        email: string
        defaultLessonCount: number
    }
}

export function StudentEditDialog({ student }: Props) {
    const [open, setOpen] = useState(false)
    const { toast } = useToast()

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: student.name || "",
            email: student.email,
            defaultLessonCount: student.defaultLessonCount,
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        const formData = new FormData()
        formData.append("name", values.name)
        formData.append("email", values.email)
        formData.append("defaultLessonCount", values.defaultLessonCount.toString())

        const result = await updateStudent(student.id, formData)

        if (result.success) {
            toast.success("生徒情報を更新しました")
            setOpen(false)
        } else {
            toast.error(result.error || "更新に失敗しました")
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Pencil className="mr-2 h-4 w-4" />
                    編集
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>生徒情報の編集</DialogTitle>
                    <DialogDescription>
                        生徒の基本情報を変更します。
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>名前</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>メールアドレス</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="defaultLessonCount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>月間レッスン契約回数</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="submit">保存</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
