// ─────────────────────────────────────────────────────────────────────────────
// lib/className.ts — One rule for every class name typed by a person (sign-up,
// create class, rename class). Names may use any script (Hindi, Telugu, Tamil…).
// Markup and invisible characters are removed or refused.
// Exports: cleanClassName, CleanClassName
// ─────────────────────────────────────────────────────────────────────────────
export type CleanClassName = { ok: true; value: string; key: string } | { ok: false; error: string }

const MAX_LENGTH = 40
// Control characters, zero-width space, left/right marks, bidi controls, word joiner, invisible operators, BOM.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​‎‏‪-‮⁠-⁯﻿]/gu
// ZWNJ / ZWJ are kept only between letters or marks (some Indian-language words need them).
const STRAY_JOINER = /(?<![\p{L}\p{M}])[‌‍]|[‌‍](?![\p{L}\p{M}])/gu
const ALLOWED = /^[\p{L}\p{M}\p{N} .‌‍-]+$/u

export function cleanClassName(input: unknown): CleanClassName {
  if (typeof input !== "string") return { ok: false, error: "Class name is required." }
  const value = input
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .replace(INVISIBLE, "")
    .replace(STRAY_JOINER, "")
    .replace(/ {2,}/g, " ")
    .trim()
  const length = [...value].length
  if (length < 1 || length > MAX_LENGTH) return { ok: false, error: "Class name must be 1 to 40 characters." }
  if (!ALLOWED.test(value)) return { ok: false, error: "Class name can use letters, numbers, spaces, hyphens and full stops only." }
  return { ok: true, value, key: value.replace(/[‌‍]/gu, "").toLocaleLowerCase("en-US") }
}
