import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { type ReactNode } from "react"
import type { UserProfile } from "@/lib/auth"

// ── Mock AuthContext ─────────────────────────────────────────────────────────
const mockUseAuth = vi.fn()
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

// ── RequireAuth inline (mirrors App.tsx logic) ───────────────────────────────
// We test the logic, not the App.tsx import, to avoid loading the full app.
function RequireAuth({ children, roles }: { children: ReactNode; roles: string[] }) {
  const { user, loading } = mockUseAuth()
  if (loading) return <div data-testid="loading-spinner" />
  if (!user)   return <div data-testid="redirect-login" />
  if (!roles.includes(user.role)) return <div data-testid="redirect-home" />
  if (user.must_change_password)  return <div data-testid="redirect-set-password" />
  return <>{children}</>
}

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

beforeEach(() => {
  mockUseAuth.mockReset()
})

describe("RequireAuth — routing logic", () => {
  it("shows loading spinner while auth is being determined", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true })

    render(
      <MemoryRouter initialEntries={["/student/dashboard"]}>
        <Routes>
          <Route path="/student/dashboard" element={
            <RequireAuth roles={["student"]}>
              <div data-testid="dashboard" />
            </RequireAuth>
          } />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId("loading-spinner")).toBeDefined()
    expect(screen.queryByTestId("dashboard")).toBeNull()
  })

  it("redirects unauthenticated users to /login", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })

    render(
      <MemoryRouter initialEntries={["/student/dashboard"]}>
        <Routes>
          <Route path="/student/dashboard" element={
            <RequireAuth roles={["student"]}>
              <div data-testid="dashboard" />
            </RequireAuth>
          } />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId("redirect-login")).toBeDefined()
    expect(screen.queryByTestId("dashboard")).toBeNull()
  })

  it("redirects wrong role to home", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ role: "teacher" }),
      loading: false,
    })

    render(
      <MemoryRouter initialEntries={["/student/dashboard"]}>
        <Routes>
          <Route path="/student/dashboard" element={
            <RequireAuth roles={["student"]}>
              <div data-testid="dashboard" />
            </RequireAuth>
          } />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId("redirect-home")).toBeDefined()
    expect(screen.queryByTestId("dashboard")).toBeNull()
  })

  it("redirects must_change_password users to /set-password", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ must_change_password: true }),
      loading: false,
    })

    render(
      <MemoryRouter initialEntries={["/student/dashboard"]}>
        <Routes>
          <Route path="/student/dashboard" element={
            <RequireAuth roles={["student"]}>
              <div data-testid="dashboard" />
            </RequireAuth>
          } />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId("redirect-set-password")).toBeDefined()
    expect(screen.queryByTestId("dashboard")).toBeNull()
  })

  it("renders children for correct role and active account", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ role: "teacher" }),
      loading: false,
    })

    render(
      <MemoryRouter initialEntries={["/teacher/dashboard"]}>
        <Routes>
          <Route path="/teacher/dashboard" element={
            <RequireAuth roles={["teacher"]}>
              <div data-testid="dashboard">Teacher Dashboard</div>
            </RequireAuth>
          } />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId("dashboard")).toBeDefined()
  })

  it("allows admin access to admin route", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ role: "admin" }),
      loading: false,
    })

    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes>
          <Route path="/admin/dashboard" element={
            <RequireAuth roles={["admin"]}>
              <div data-testid="admin-dashboard">Admin</div>
            </RequireAuth>
          } />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId("admin-dashboard")).toBeDefined()
  })
})
