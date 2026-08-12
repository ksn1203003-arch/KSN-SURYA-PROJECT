import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, createSchool, createClass, createUser } from "./helpers.js"
import { School, PLAN_STORAGE_QUOTAS } from "../models/School.js"
import { Module } from "../models/Module.js"

describe("Storage quota tracking", () => {
  beforeAll(startDb)
  afterAll(stopDb)
  afterEach(clearDb)

  it("PLAN_STORAGE_QUOTAS has positive quota for all plans", () => {
    for (const plan of ["free", "starter", "standard", "premium"]) {
      expect(PLAN_STORAGE_QUOTAS[plan]).toBeGreaterThan(0)
    }
    // premium > standard > starter > free
    expect(PLAN_STORAGE_QUOTAS.premium).toBeGreaterThan(PLAN_STORAGE_QUOTAS.standard)
    expect(PLAN_STORAGE_QUOTAS.standard).toBeGreaterThan(PLAN_STORAGE_QUOTAS.starter)
    expect(PLAN_STORAGE_QUOTAS.starter).toBeGreaterThan(PLAN_STORAGE_QUOTAS.free)
  })

  it("school storage_used_bytes starts at 0 and cannot go below 0", async () => {
    const school = await createSchool()
    expect(school.storage_used_bytes).toBe(0)

    // Decrement via aggregation pipeline — should floor at 0
    // Mongoose requires { updatePipeline: true } when passing an array as update
    await School.updateOne(
      { _id: school._id },
      [{ $set: { storage_used_bytes: { $max: [0, { $subtract: ["$storage_used_bytes", 999] }] } } }],
      { updatePipeline: true } as Parameters<typeof School.updateOne>[2],
    )
    const updated = await School.findById(school._id).lean()
    expect(updated?.storage_used_bytes).toBe(0)
  })

  it("storage_used_bytes increments correctly on upload simulation", async () => {
    const school = await createSchool()
    const UPLOAD_SIZE = 5 * 1024 * 1024 // 5 MB

    await School.updateOne({ _id: school._id }, { $inc: { storage_used_bytes: UPLOAD_SIZE } })
    const after = await School.findById(school._id).lean()
    expect(after?.storage_used_bytes).toBe(UPLOAD_SIZE)
  })

  it("storage_used_bytes decrements on delete simulation", async () => {
    const school = await createSchool()
    const SIZE   = 10 * 1024 * 1024 // 10 MB

    await School.updateOne({ _id: school._id }, { $inc: { storage_used_bytes: SIZE } })
    await School.updateOne(
      { _id: school._id },
      [{ $set: { storage_used_bytes: { $max: [0, { $subtract: ["$storage_used_bytes", SIZE] }] } } }],
      { updatePipeline: true } as Parameters<typeof School.updateOne>[2],
    )
    const after = await School.findById(school._id).lean()
    expect(after?.storage_used_bytes).toBe(0)
  })

  it("school schema rejects negative storage_used_bytes via $set", async () => {
    const school = await createSchool()
    // The min: 0 validator runs on save() but not on updateOne. The aggregation-pipeline
    // $max guard is our actual runtime protection — tested above. This test verifies
    // direct Mongoose save respects the min constraint.
    const doc = await School.findById(school._id)
    if (!doc) throw new Error("school not found")
    doc.storage_used_bytes = -1
    await expect(doc.save()).rejects.toThrow()
  })

  it("free plan quota is 2 GB", () => {
    expect(PLAN_STORAGE_QUOTAS.free).toBe(2 * 1024 ** 3)
  })
})
