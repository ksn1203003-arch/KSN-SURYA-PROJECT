// ─────────────────────────────────────────────────────────────────────────────
// lib/utils.ts — Shared Tailwind class merging utility.
// Do NOT move or rename — shadcn/ui resolves cn() via the "@/lib/utils" alias.
// Exports: cn()
// ─────────────────────────────────────────────────────────────────────────────
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
