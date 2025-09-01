import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// UUID utility used across the app and tests
export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID()
  } catch {
    // ignore
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function twoCharAbbrs(entries: Array<{ id: string | number; name: string }>): Record<string, string> {
  const byFirst: Record<string, Array<{ id: string; name: string; raw: string }>> = {}
  for (const e of entries) {
    const raw = (e.name ?? "").trim()
    const norm = raw.toUpperCase()
    const first = norm[0] ?? "?"
    const id = String(e.id)
    ;(byFirst[first] ||= []).push({ id, name: norm, raw })
  }
  const result: Record<string, string> = {}
  for (const [first, group] of Object.entries(byFirst)) {
    const maxLen = Math.max(1, ...group.map(g => g.name.length))
    // Build per-position frequency maps (skip pos 0; we always use the first letter for char 1)
    const freq: Array<Map<string, number>> = []
    for (let pos = 1; pos < maxLen; pos++) {
      const m = new Map<string, number>()
      for (const g of group) {
        const c = g.name[pos]
        if (!c) continue
        m.set(c, (m.get(c) ?? 0) + 1)
      }
      freq[pos] = m
    }
    for (const g of group) {
      let second: string | undefined
      // Prefer a position where this player's char is unique within the group
      for (let pos = 1; pos < maxLen; pos++) {
        const c = g.name[pos]
        if (!c) continue
        const m = freq[pos]
        if (m && (m.get(c) ?? 0) === 1) { second = c; break }
      }
      // Fallbacks: any digit in raw name; else last char; else second char; else '?'
      if (!second) {
        const digits = g.raw.match(/[0-9]/g)
        if (digits && digits.length) {
          second = digits[digits.length - 1]
        } else if (g.name.length > 1) {
          second = g.name[g.name.length - 1]
        } else {
          second = g.name[1] ?? "?"
        }
      }
      result[g.id] = `${first}${second}`
    }
  }
  return result
}
