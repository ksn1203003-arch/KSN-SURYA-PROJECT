/**
 * Seed script — run once to populate Atlas with demo data.
 * Usage: npx tsx --env-file=.env scripts/seed.ts
 */

import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/teachscript"

// ── Inline minimal schemas (avoid rootDir restriction) ────────────────────────

const schoolSchema = new mongoose.Schema({
  name: String, board: String, city: String, state: String,
  udise_code: { type: String, default: null },
  subscription_plan: { type: String, default: "standard" },
  created_at: { type: Date, default: Date.now },
})
const School = mongoose.models.School ?? mongoose.model("School", schoolSchema)

const classSchema = new mongoose.Schema({
  school_id: mongoose.Schema.Types.ObjectId,
  grade: Number, section: String,
  teacher_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  created_at: { type: Date, default: Date.now },
})
const Class = mongoose.models.Class ?? mongoose.model("Class", classSchema)

const userSchema = new mongoose.Schema({
  name: String, email: { type: String, lowercase: true },
  phone: { type: String, default: null },
  username: { type: String, default: null },
  password_hash: String,
  role: String, school_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  class_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  is_active: { type: Boolean, default: true },
  preferred_language: { type: String, default: "english" },
  profile_photo_url: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
})
const User = mongoose.models.User ?? mongoose.model("User", userSchema)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hash(pw: string) { return bcrypt.hash(pw, 12) }

function log(label: string, data: Record<string, string>) {
  console.log(`\n✅ ${label}`)
  for (const [k, v] of Object.entries(data)) console.log(`   ${k.padEnd(16)}: ${v}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("\n🌱 Connecting to MongoDB Atlas...")
  await mongoose.connect(MONGODB_URI)
  console.log("✅ Connected\n")

  // Wipe existing data so re-running is idempotent
  await Promise.all([School.deleteMany({}), Class.deleteMany({}), User.deleteMany({})])
  console.log("🗑️  Cleared existing data\n")

  // ── School ────────────────────────────────────────────────────────────────
  const school = await School.create({
    name: "Delhi Public School, Hyderabad",
    board: "CBSE",
    city: "Hyderabad",
    state: "Telangana",
    subscription_plan: "standard",
  })
  const sid = school._id

  // ── Classes ───────────────────────────────────────────────────────────────
  const [c6A, c6B, c7A, c7B, c8A] = await Promise.all([
    Class.create({ school_id: sid, grade: 6, section: "A" }),
    Class.create({ school_id: sid, grade: 6, section: "B" }),
    Class.create({ school_id: sid, grade: 7, section: "A" }),
    Class.create({ school_id: sid, grade: 7, section: "B" }),
    Class.create({ school_id: sid, grade: 8, section: "A" }),
  ])

  // ── Super Admin ───────────────────────────────────────────────────────────
  await User.create({
    name: "Rekha Kapoor",
    email: "ksn1203003@gmail.com",
    phone: "+919876500001",
    password_hash: await hash("Admin@1234"),
    role: "super_admin",
    school_id: sid,
  })
  log("Super Admin", {
    email: "admin@dps-hyd.edu.in",
    password: "Admin@1234",
    tab: "Admin",
  })

  // ── Teachers ──────────────────────────────────────────────────────────────
  const t1 = await User.create({
    name: "Priya Sharma",
    email: "priya.sharma@dps-hyd.edu.in",
    phone: "+919876500002",
    password_hash: await hash("Teacher@1234"),
    role: "teacher",
    school_id: sid,
    class_id: c6B._id,
  })
  await Class.findByIdAndUpdate(c6B._id, { teacher_id: t1._id })
  await Class.findByIdAndUpdate(c7A._id, { teacher_id: t1._id })

  const t2 = await User.create({
    name: "Vikram Iyer",
    email: "vikram.iyer@dps-hyd.edu.in",
    phone: "+919876500003",
    password_hash: await hash("Teacher@1234"),
    role: "teacher",
    school_id: sid,
    class_id: c8A._id,
  })
  await Class.findByIdAndUpdate(c8A._id, { teacher_id: t2._id })

  const t3 = await User.create({
    name: "Meena Pillai",
    email: "meena.pillai@dps-hyd.edu.in",
    phone: "+919876500004",
    password_hash: await hash("Teacher@1234"),
    role: "teacher",
    school_id: sid,
    class_id: c7B._id,
  })
  await Class.findByIdAndUpdate(c7B._id, { teacher_id: t3._id })

  log("Teacher 1 — Priya Sharma (Class 6B & 7A)", {
    email: "priya.sharma@dps-hyd.edu.in",
    password: "Teacher@1234",
    tab: "Teacher",
  })
  log("Teacher 2 — Vikram Iyer (Class 8A)", {
    email: "vikram.iyer@dps-hyd.edu.in",
    password: "Teacher@1234",
    tab: "Teacher",
  })
  log("Teacher 3 — Meena Pillai (Class 7B)", {
    email: "meena.pillai@dps-hyd.edu.in",
    password: "Teacher@1234",
    tab: "Teacher",
  })

  // ── Students in Class 6B ──────────────────────────────────────────────────
  const students = [
    { name: "Arjun Reddy",   roll: "01", email: "arjun.reddy@dps-hyd.edu.in" },
    { name: "Preethi Nair",  roll: "02", email: "preethi.nair@dps-hyd.edu.in" },
    { name: "Rohan Gupta",   roll: "03", email: "rohan.gupta@dps-hyd.edu.in" },
    { name: "Ananya Singh",  roll: "04", email: "ananya.singh@dps-hyd.edu.in" },
    { name: "Kavya Rao",     roll: "05", email: "kavya.rao@dps-hyd.edu.in" },
  ]

  for (const s of students) {
    const username = `6b${s.roll}`
    await User.create({
      name: s.name,
      email: s.email,
      username,
      password_hash: await hash("Student@1234"),
      role: "student",
      school_id: sid,
      class_id: c6B._id,
    })
  }

  console.log("\n✅ Students (Class 6B) — all share password: Student@1234")
  students.forEach((s, i) => {
    console.log(`   username: 6b0${i + 1}   name: ${s.name}`)
  })
  console.log("   tab: Student")

  console.log("\n" + "═".repeat(55))
  console.log("🎉 Seed complete! School: Delhi Public School, Hyderabad")
  console.log("═".repeat(55))
  console.log("\nQuick login summary:")
  console.log("  Admin    → ksn1203003@gmail.com      / Admin@1234")
  console.log("  Teacher  → priya.sharma@dps-hyd.edu.in / Teacher@1234")
  console.log("  Student  → username: 6b01           / Student@1234")
  console.log("")

  await mongoose.disconnect()
}

seed().catch(err => {
  console.error("\n❌ Seed failed:", err.message)
  process.exit(1)
})
