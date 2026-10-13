// ─────────────────────────────────────────────────────────────────────────────
// lib/sessionCaches.ts — Registry of in-memory request caches that belong to the
// signed-in user. API modules register a clear function when they load; sign-out
// (AuthContext) clears them all so nothing leaks to the next person on the device.
// Kept dependency-free so the sign-in path never pulls in heavy API modules.
// ─────────────────────────────────────────────────────────────────────────────
const clearers = new Set<() => void>()

export function registerSessionCache(clear: () => void): void {
  clearers.add(clear)
}

export function clearSessionCaches(): void {
  clearers.forEach(clear => clear())
}
