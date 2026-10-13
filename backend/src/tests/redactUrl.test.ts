import { describe, it, expect } from "vitest"
import { redactUrl, serializeRequestForLog } from "../lib/redactUrl.js"

describe("redactUrl — secrets never reach the logs", () => {
  it("hides stream, file and reset tokens but keeps the path and other parameters", () => {
    expect(redactUrl("/api/files/abc?st=SECRET1")).toBe("/api/files/abc?st=[redacted]")
    expect(redactUrl("/api/files/abc?x=1&ft=SECRET2&y=2")).toBe("/api/files/abc?x=1&ft=[redacted]&y=2")
    expect(redactUrl("/set-password?token=SECRET3")).toBe("/set-password?token=[redacted]")
    expect(redactUrl("/api/school/students?class_id=1")).toBe("/api/school/students?class_id=1")
  })
})

describe("request log lines", () => {
  it("the logged request never carries a token, in any letter case or position", () => {
    const line = serializeRequestForLog({ method: "GET", url: "/api/files/abc?x=1&ST=SECRET1&ft=SECRET2", id: "r1" })
    expect(JSON.stringify(line)).not.toMatch(/SECRET/)
    expect(line).toEqual({ method: "GET", url: "/api/files/abc?x=1&ST=[redacted]&ft=[redacted]", id: "r1" })
  })
})
