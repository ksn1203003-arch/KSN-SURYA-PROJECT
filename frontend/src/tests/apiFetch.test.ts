import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { signIn, getCurrentUser } from "@/lib/auth"

// Mock fetch globally for all tests in this file
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response
}

describe("signIn — error shape returned, not thrown", () => {
  it("returns { error } when server returns 401", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ error: "Incorrect password." }, 401)
    )

    const result = await signIn("test@example.com", "wrongpass")

    expect(result.user).toBeNull()
    expect(result.error).toBe("Incorrect password.")
    expect(result.isFallback).toBe(false)
  })

  it("returns { error } when server returns 400", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ error: "Identifier and password are required" }, 400)
    )

    const result = await signIn("", "")

    expect(result.user).toBeNull()
    expect(result.error).toBe("Identifier and password are required")
  })

  it("returns user on successful login", async () => {
    const mockUser = {
      id: "abc123",
      name: "Test Teacher",
      email: "teacher@school.com",
      phone: null,
      username: null,
      role: "teacher" as const,
      school_id: "school1",
      class_id: null,
      profile_photo_url: null,
      preferred_language: "english" as const,
      is_active: true,
      must_change_password: false,
    }

    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ user: mockUser }, 200)
    )

    const result = await signIn("teacher@school.com", "Password@123")

    expect(result.error).toBeNull()
    expect(result.user).toEqual(mockUser)
    expect(result.user?.role).toBe("teacher")
  })

  it("returns error when fetch times out (null response)", async () => {
    // Simulate timeout: apiFetch returns null when withTimeout races out
    mockFetch.mockReturnValueOnce(new Promise(() => {})) // never resolves

    // Race with very short delay — we can't actually wait 15s in tests
    // Instead directly test the null-response path via getCurrentUser
    const result = await getCurrentUser()
    // getCurrentUser returns null on null or non-ok response
    // Since our fetch never resolves, we'd wait forever, so skip timer test
    // This assertion covers the null-return path via a timeout mock
    expect(result).toBeNull()
  }, 20000)

  it("returns otpRequired signal when server sends otp_required", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({
        otp_required: true,
        otp_session:  "session-token-xyz",
        masked_email: "t***@school.com",
      }, 200)
    )

    const result = await signIn("teacher@school.com", "Password@123")

    expect(result.user).toBeNull()
    expect(result.error).toBeNull()
    expect(result.otpRequired).toBe(true)
    expect(result.otpSession).toBe("session-token-xyz")
  })
})

describe("getCurrentUser — error shape returned, not thrown", () => {
  it("returns null on 401", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: "Authentication required" }, 401))

    const result = await getCurrentUser()
    expect(result).toBeNull()
  })

  it("returns user profile on 200", async () => {
    const mockProfile = {
      id: "user1",
      name: "Student One",
      email: "student@school.com",
      phone: null,
      username: "student1",
      role: "student" as const,
      school_id: "school1",
      class_id: "class1",
      profile_photo_url: null,
      preferred_language: "hindi" as const,
      is_active: true,
    }

    mockFetch.mockResolvedValueOnce(makeJsonResponse({ profile: mockProfile }, 200))

    const result = await getCurrentUser()
    expect(result).toEqual(mockProfile)
    expect(result?.role).toBe("student")
  })
})
