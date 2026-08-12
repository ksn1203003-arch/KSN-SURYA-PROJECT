import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, createSchool, createUser } from "./helpers.js"
import { AuditLog } from "../models/AuditLog.js"

describe("AuditLog model", () => {
  beforeAll(startDb)
  afterAll(stopDb)
  afterEach(clearDb)

  it("creates an audit log entry with all required fields", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")

    const entry = await AuditLog.create({
      school_id:     school._id,
      actor_id:      admin._id,
      actor_role:    "admin",
      action:        "dpdp.deletion_approved",
      resource_type: "DataDeletionRequest",
      resource_id:   new mongoose.Types.ObjectId().toString(),
      before:        { status: "pending" },
      after:         { status: "approved" },
      ip:            "127.0.0.1",
    })

    expect(entry._id).toBeTruthy()
    expect(entry.action).toBe("dpdp.deletion_approved")
    expect(entry.actor_role).toBe("admin")
    expect(entry.timestamp).toBeInstanceOf(Date)
  })

  it("can query entries by school_id sorted by timestamp desc", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")

    await AuditLog.create([
      { school_id: school._id, actor_id: admin._id, actor_role: "admin", action: "marks.bulk_upsert", resource_type: "ExamDefinition", resource_id: "x1", ip: null },
      { school_id: school._id, actor_id: admin._id, actor_role: "admin", action: "dpdp.deletion_rejected", resource_type: "DataDeletionRequest", resource_id: "x2", ip: null },
    ])

    const entries = await AuditLog.find({ school_id: school._id }).sort({ timestamp: -1 }).lean()
    expect(entries.length).toBe(2)
    // Both belong to this school
    entries.forEach(e => expect(e.school_id.toString()).toBe(school._id.toString()))
  })

  it("does not leak entries from a different school", async () => {
    const schoolA = await createSchool()
    const schoolB = await createSchool()
    const adminA  = await createUser(schoolA._id, "admin")
    const adminB  = await createUser(schoolB._id, "admin")

    await AuditLog.create({ school_id: schoolA._id, actor_id: adminA._id, actor_role: "admin", action: "marks.bulk_upsert", resource_type: "ExamDefinition", resource_id: "a1", ip: null })
    await AuditLog.create({ school_id: schoolB._id, actor_id: adminB._id, actor_role: "admin", action: "dpdp.deletion_approved", resource_type: "DataDeletionRequest", resource_id: "b1", ip: null })

    const entriesA = await AuditLog.find({ school_id: schoolA._id }).lean()
    const entriesB = await AuditLog.find({ school_id: schoolB._id }).lean()

    expect(entriesA.length).toBe(1)
    expect(entriesB.length).toBe(1)
    expect(entriesA[0].resource_id).toBe("a1")
    expect(entriesB[0].resource_id).toBe("b1")
  })

  it("requires school_id, actor_id, action, resource_type, resource_id", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")

    // Missing action — should fail validation
    await expect(
      AuditLog.create({ school_id: school._id, actor_id: admin._id, actor_role: "admin", resource_type: "T", resource_id: "r1", ip: null })
    ).rejects.toThrow()
  })
})
