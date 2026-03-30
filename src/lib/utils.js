import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/** Normalize FastAPI `detail` (string | {msg}[] | object) for UI. */
export async function formatApiError(response) {
  let fallback = `Request failed (${response.status})`
  try {
    const data = await response.json()
    const detail = data.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail
        .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
        .join("; ")
    }
    if (detail && typeof detail === "object") {
      return JSON.stringify(detail)
    }
  } catch {
    /* ignore */
  }
  return fallback
}
