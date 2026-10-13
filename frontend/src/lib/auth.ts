// ─────────────────────────────────────────────────────────────────────────────
// lib/auth.ts — Authentication API functions for the frontend.
// Handles sign-in, sign-out, current user fetch, and password reset flow.
// All calls use credentials: "include" so the ts_token httpOnly cookie is sent.
// Exports: signIn(), signOut(), getCurrentUser(), requestPasswordReset(),
//          resetPassword(), UserProfile
// ─────────────────────────────────────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

export interface UserProfile {
  id: string
  name: string
  email: string
  phone: string | null
  username: string | null
  role: "student" | "teacher" | "admin" | "super_admin" | "parent"
  gender: "male" | "female" | null
  school_id: string | null
  class_id: string | null
  profile_photo_url: string | null
  preferred_language: "english" | "hindi"
  is_active: boolean
  must_change_password?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response | null> {
  return withTimeout(
    fetch(`${BACKEND}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    }),
    15_000
  )
}

// ── Auth functions ────────────────────────────────────────────────────────────

export async function signIn(
  identifier: string,
  password: string
): Promise<{
  user: UserProfile | null
  error: string | null
  isFallback: boolean
  otpRequired?: boolean
  otpSession?: string
  maskedEmail?: string
}> {
  const res = await apiFetch("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  })

  if (!res) {
    return { user: null, error: "Sign-in timed out. Check your internet connection and try again.", isFallback: false }
  }

  const data = await res.json() as {
    user?: UserProfile
    error?: string
    otp_required?: boolean
    otp_session?: string
    masked_email?: string
  }

  if (!res.ok) {
    return { user: null, error: data.error ?? "Login failed. Please try again.", isFallback: false }
  }

  if (data.otp_required) {
    return {
      user: null,
      error: null,
      isFallback: false,
      otpRequired: true,
      otpSession: data.otp_session,
      maskedEmail: data.masked_email,
    }
  }

  if (!data.user) {
    return { user: null, error: "Login failed. Please try again.", isFallback: false }
  }

  return { user: data.user, error: null, isFallback: false }
}

export async function verifyOTP(
  otpSession: string,
  code: string
): Promise<{ user: UserProfile | null; error: string | null }> {
  const res = await apiFetch("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ otp_session: otpSession, code }),
  })
  if (!res) return { user: null, error: "Request timed out. Please try again." }
  const data = await res.json() as { user?: UserProfile; error?: string }
  if (!res.ok || !data.user) return { user: null, error: data.error ?? "Verification failed. Please try again." }
  return { user: data.user, error: null }
}

export async function signOut(): Promise<void> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    await fetch(`${BACKEND}/api/auth/signout`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))
  } catch {
    // Offline, network error, or timeout — local state is cleared by the caller regardless.
    // The token_version increment on the server is best-effort; the JWT TTL still enforces expiry.
  }
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const res = await apiFetch("/api/auth/me")
  if (!res || !res.ok) return null

  const data = await res.json() as { profile?: UserProfile }
  return data.profile ?? null
}

export async function sendPasswordResetOTP(
  email: string
): Promise<{ error: string | null }> {
  const res = await apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
  if (!res) return { error: "Request timed out. Please try again." }
  if (!res.ok) {
    const d = await res.json() as { error?: string }
    return { error: d.error ?? "Something went wrong" }
  }
  return { error: null }
}

export async function sendSmsOtp(
  phone: string
): Promise<{ otpSession: string | null; maskedPhone: string | null; error: string | null }> {
  const res = await apiFetch("/api/auth/send-sms-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  })
  if (!res) return { otpSession: null, maskedPhone: null, error: "Request timed out. Please try again." }
  const data = await res.json() as { success?: boolean; otp_session?: string; masked_phone?: string; error?: string }
  if (!res.ok) return { otpSession: null, maskedPhone: null, error: data.error ?? "Failed to send OTP." }
  return { otpSession: data.otp_session ?? null, maskedPhone: data.masked_phone ?? null, error: null }
}

export async function verifySmsOtp(
  otpSession: string,
  code: string
): Promise<{ user: UserProfile | null; error: string | null }> {
  const res = await apiFetch("/api/auth/verify-sms-otp", {
    method: "POST",
    body: JSON.stringify({ otp_session: otpSession, code }),
  })
  if (!res) return { user: null, error: "Request timed out. Please try again." }
  const data = await res.json() as { user?: UserProfile; error?: string }
  if (!res.ok || !data.user) return { user: null, error: data.error ?? "Verification failed. Please try again." }
  return { user: data.user, error: null }
}

export async function changePassword(newPassword: string): Promise<{ error: string | null }> {
  const res = await apiFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  })
  if (!res) return { error: "Request timed out. Please try again." }
  if (!res.ok) {
    const d = await res.json() as { error?: string }
    return { error: d.error ?? "Failed to change password" }
  }
  return { error: null }
}

export async function resetPassword(
  token: string,
  email: string,
  password: string
): Promise<{ error: string | null }> {
  const res = await apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, email, password }),
  })
  if (!res) return { error: "Request timed out." }
  const data = await res.json() as { error?: string }
  if (!res.ok) return { error: data.error ?? "Reset failed." }
  return { error: null }
}
