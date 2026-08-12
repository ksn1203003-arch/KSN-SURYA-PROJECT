// Supabase has been replaced with MongoDB + JWT auth.
// This file is kept as an empty stub so old imports don't break during migration.
// All actual auth now goes through src/lib/auth.ts → backend /api/auth/*

export const supabase = {
  auth: {
    signOut: async () => { /* handled by auth.ts signOut() */ },
  },
} as const
