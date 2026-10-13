import { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { User } from "../models/User.js"
import { School } from "../models/School.js"
import { Class } from "../models/Class.js"

export const JWT_SECRET = "test-secret-at-least-32-characters-long"
process.env.JWT_SECRET = JWT_SECRET

let mongod: MongoMemoryReplSet

export async function startDb(): Promise<void> {
  // Use a replica set so MongoDB transactions work in tests — mirrors production
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  await mongoose.connect(mongod.getUri())
}

export async function stopDb(): Promise<void> {
  await mongoose.disconnect()
  await mongod.stop({ doCleanup: true })
}

export async function clearDb(): Promise<void> {
  const collections = mongoose.connection.collections
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({})
  }
}

export function makeJwt(userId: string, role: string, tokenVersion = 0): string {
  // tv (token_version) must be present — middleware rejects tokens where tv < DB value
  return jwt.sign({ sub: userId, role, tv: tokenVersion }, JWT_SECRET, { expiresIn: "1h" })
}

export async function createSchool() {
  return School.create({
    name: "Test School",
    board: "CBSE",
    city: "Hyderabad",
    state: "Telangana",
    subscription_plan: "free",
    udise_code: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })
}

export async function createClass(
  schoolId: mongoose.Types.ObjectId,
  teacherId?: mongoose.Types.ObjectId,
  overrides: { grade?: number; section?: string; name?: string; year_start?: string | null } = {},
) {
  const grade   = overrides.grade   ?? 5
  const section = overrides.section ?? String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Date.now().toString(36).slice(-4)
  const name    = overrides.name    ?? `Class ${grade}${section}`
  // A class now needs a stored school-year start before attendance can be saved, so tests get an early one by default.
  // A test that wants a class with no stored start (an older class) passes year_start: null.
  const year_start = overrides.year_start === undefined ? "2000-01-01" : overrides.year_start
  return Class.create({
    school_id: schoolId,
    grade,
    section,
    name,
    year_start,
    subjects: ["Math", "Science", "English"],
    teachers: teacherId
      ? [{ teacher_id: teacherId, subject: "Math" }]
      : [],
    timetable: [],
    timetable_versions: [],
  })
}

export async function createUser(
  schoolId: mongoose.Types.ObjectId,
  role: "student" | "teacher" | "admin" | "parent",
  classId?: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {}
) {
  const password_hash = await bcrypt.hash("Password@123", 10)
  const suffix = Math.random().toString(36).slice(2, 8) + Date.now()
  return User.create({
    name: `Test ${role} ${suffix}`,
    email: `${role}-${suffix}@test.com`,
    // Use a unique username so the sparse unique index doesn't collide on null
    username: `${role}_${suffix}`,
    phone: null,
    password_hash,
    role,
    school_id: schoolId,
    class_id: classId ?? null,
    is_active: true,
    ...overrides,
  })
}
