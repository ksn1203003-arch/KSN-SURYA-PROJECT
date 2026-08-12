import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import type { Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { startDb, stopDb, clearDb, createSchool, createUser, JWT_SECRET } from "./helpers.js"
import { requireAuth, requireAdmin, type AuthRequest } from "../middleware/auth.js"

beforeAll(startDb)
afterAll(stopDb)
afterEach(clearDb)

function mockRes() {
  const res = {
    status: (code: number) => { res._status = code; return res },
    json:   (body: unknown) => { res._body = body; return res },
    _status: 200,
    _body: null as unknown,
  }
  return res
}

function mockNext(): { fn: NextFunction; called: boolean } {
  const tracker = { fn: (() => { tracker.called = true }) as NextFunction, called: false }
  return tracker
}

describe("requireAuth", () => {
  it("rejects request with no token", async () => {
    const req = { headers: {} } as AuthRequest
    const res = mockRes()
    const next = mockNext()

    requireAuth(req, res as unknown as Response, next.fn)
    await new Promise(r => setTimeout(r, 50))

    expect(res._status).toBe(401)
    expect((res._body as { error: string }).error).toContain("Authentication required")
    expect(next.called).toBe(false)
  })

  it("rejects an expired JWT", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "teacher")
    const token  = jwt.sign({ sub: user._id.toString(), role: "teacher" }, JWT_SECRET, { expiresIn: -1 })

    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = mockNext()

    requireAuth(req, res as unknown as Response, next.fn)
    await new Promise(r => setTimeout(r, 50))

    expect(res._status).toBe(401)
    expect((res._body as { error: string }).error).toContain("Invalid or expired")
  })

  it("rejects a token signed with wrong secret", async () => {
    const token = jwt.sign({ sub: "someid", role: "student" }, "wrong-secret-xxxxxxxxxxxxxxxxxxxxxxx")
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = mockNext()

    requireAuth(req, res as unknown as Response, next.fn)
    await new Promise(r => setTimeout(r, 50))

    expect(res._status).toBe(401)
  })

  it("accepts a valid token and sets userId + userRole", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "teacher")
    const token  = jwt.sign({ sub: user._id.toString(), role: "teacher" }, JWT_SECRET, { expiresIn: "1h" })

    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = mockNext()

    requireAuth(req, res as unknown as Response, next.fn)
    await new Promise(r => setTimeout(r, 100))

    expect(next.called).toBe(true)
    expect(req.userId).toBe(user._id.toString())
    expect(req.userRole).toBe("teacher")
  })

  it("rejects token for deactivated user", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "teacher", undefined, { is_active: false })
    const token  = jwt.sign({ sub: user._id.toString(), role: "teacher" }, JWT_SECRET, { expiresIn: "1h" })

    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = mockNext()

    requireAuth(req, res as unknown as Response, next.fn)
    await new Promise(r => setTimeout(r, 100))

    expect(res._status).toBe(401)
    expect((res._body as { error: string }).error).toContain("deactivated")
    expect(next.called).toBe(false)
  })
})

describe("requireAdmin", () => {
  it("allows admin role through", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "admin")
    const token  = jwt.sign({ sub: user._id.toString(), role: "admin" }, JWT_SECRET, { expiresIn: "1h" })

    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = mockNext()

    requireAdmin(req, res as unknown as Response, next.fn)
    await new Promise(r => setTimeout(r, 100))

    expect(next.called).toBe(true)
  })

  it("blocks teacher from admin-only route", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "teacher")
    const token  = jwt.sign({ sub: user._id.toString(), role: "teacher" }, JWT_SECRET, { expiresIn: "1h" })

    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = mockNext()

    requireAdmin(req, res as unknown as Response, next.fn)
    await new Promise(r => setTimeout(r, 100))

    expect(res._status).toBe(403)
    expect((res._body as { error: string }).error).toContain("Admin access required")
    expect(next.called).toBe(false)
  })
})
