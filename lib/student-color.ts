const STUDENT_COLOR_PALETTE = [
    { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-900" },
    { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-900" },
    { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900" },
    { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-900" },
    { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-900" },
    { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900" },
    { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-900" },
    { bg: "bg-fuchsia-100", border: "border-fuchsia-300", text: "text-fuchsia-900" },
    { bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-900" },
    { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-900" },
] as const

function hashStudentId(value: string) {
    let hash = 0
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0
    }
    return hash
}

export function getStudentColorClasses(studentId: string | null | undefined) {
    if (!studentId) {
        return {
            bg: "bg-slate-100",
            border: "border-slate-300",
            text: "text-slate-900",
        }
    }
    const index = hashStudentId(studentId) % STUDENT_COLOR_PALETTE.length
    return STUDENT_COLOR_PALETTE[index]
}
