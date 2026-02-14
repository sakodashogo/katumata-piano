import { cache } from "react"
import { auth } from "@/auth"

export const getCachedSession = cache(async () => auth())
