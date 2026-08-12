import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, act, screen } from "@testing-library/react"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import type { UserProfile } from "@/lib/auth"

// Mock the auth lib functions
const mockGetCurrentUser = vi.fn()
const mockSignOut = vi.fn()

vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  signOut:        (...args: unknown[]) => mockSignOut(...args),
}))

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id:                  "u1",
    name:                "Test User",
    email:               "user@test.com",
    phone:               null,
    username:            null,
    role:                "student",
    school_id:           "s1",
    class_id:            "c1",
    profile_photo_url:   null,
    preferred_language:  "english",
    is_active:           true,
    must_change_password: false,
    ...overrides,
  }
}

// Test component that exposes auth state
function TestConsumer() {
  const { user, loading, idleWarning, resetIdleTimer } = useAuth()
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user?.name ?? "null"}</div>
      <div data-testid="idle-warning">{String(idleWarning)}</div>
      <button data-testid="reset-idle" onClick={resetIdleTimer}>Reset</button>
    </div>
  )
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockSignOut.mockReset()
  sessionStorage.clear()
})

afterEach(() => {
  vi.clearAllTimers()
})

describe("AuthProvider — initial loading", () => {
  it("starts loading=true and resolves to false after auth check", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    let capturedLoading: boolean | null = null

    function LoadCapture() {
      const { loading } = useAuth()
      capturedLoading = loading
      return null
    }

    await act(async () => {
      render(
        <AuthProvider>
          <LoadCapture />
        </AuthProvider>
      )
    })

    expect(capturedLoading).toBe(false)
  })

  it("populates user when getCurrentUser returns a profile", async () => {
    const user = makeUser({ role: "teacher", name: "Mrs. Sharma" })
    mockGetCurrentUser.mockResolvedValueOnce(user)

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )
    })

    expect(screen.getByTestId("user").textContent).toBe("Mrs. Sharma")
    expect(screen.getByTestId("loading").textContent).toBe("false")
  })

  it("leaves user null when getCurrentUser returns null (not logged in)", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )
    })

    expect(screen.getByTestId("user").textContent).toBe("null")
  })
})

describe("AuthProvider — resetIdleTimer", () => {
  it("writes deadline to sessionStorage when resetIdleTimer is called", async () => {
    vi.useFakeTimers()
    const user = makeUser()
    mockGetCurrentUser.mockResolvedValueOnce(user)

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )
    })

    const before = Date.now()

    await act(async () => {
      screen.getByTestId("reset-idle").click()
    })

    const stored = sessionStorage.getItem("ts_logout_at")
    expect(stored).not.toBeNull()
    // Deadline should be ~15 minutes in the future
    const deadline = parseInt(stored!, 10)
    expect(deadline).toBeGreaterThan(before + 14 * 60 * 1000)

    vi.useRealTimers()
  })

  it("sets idleWarning after 14 minutes of inactivity", async () => {
    vi.useFakeTimers()
    const user = makeUser()
    mockGetCurrentUser.mockResolvedValueOnce(user)

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )
    })

    // Trigger the idle timer
    await act(async () => {
      screen.getByTestId("reset-idle").click()
    })

    expect(screen.getByTestId("idle-warning").textContent).toBe("false")

    // Advance 14 minutes (IDLE_TIMEOUT_MS - WARN_BEFORE_MS = 15min - 1min = 14min)
    await act(async () => {
      vi.advanceTimersByTime(14 * 60 * 1000 + 100)
    })

    expect(screen.getByTestId("idle-warning").textContent).toBe("true")

    vi.useRealTimers()
  })
})

describe("AuthProvider — setUserFromLogin", () => {
  it("can set user without refetching from the server", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    function LoginSimulator() {
      const { user, setUserFromLogin } = useAuth()
      return (
        <>
          <div data-testid="user-name">{user?.name ?? "null"}</div>
          <button data-testid="do-login" onClick={() => setUserFromLogin(makeUser({ name: "Direct Login User" }))}>
            Login
          </button>
        </>
      )
    }

    await act(async () => {
      render(
        <AuthProvider>
          <LoginSimulator />
        </AuthProvider>
      )
    })

    expect(screen.getByTestId("user-name").textContent).toBe("null")

    await act(async () => {
      screen.getByTestId("do-login").click()
    })

    expect(screen.getByTestId("user-name").textContent).toBe("Direct Login User")
    // getCurrentUser should only have been called once during mount, not again after login
    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1)
  })
})
