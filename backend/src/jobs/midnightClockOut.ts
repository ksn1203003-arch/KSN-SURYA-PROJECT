import cron from "node-cron"
import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// jobs/midnightClockOut.ts — Scheduled job that auto-closes open teacher sessions.
// Runs every night at IST midnight (00:00 Asia/Kolkata) and marks any session
// without a logout_at as ended at 23:59 so durations are always finite.
// ─────────────────────────────────────────────────────────────────────────────
import { TeacherSession } from "../models/TeacherSession.js"

async function closeOpenSessions(): Promise<void> {
  const now      = new Date()
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

  const open = await TeacherSession.find({
    logout_at: null,
    date:      { $ne: todayStr }, // sessions from before today
  })

  for (const s of open) {
    const midnight = new Date(`${s.date}T23:59:59+05:30`)
    s.logout_at        = midnight
    s.duration_minutes = Math.max(0, Math.round(
      (midnight.getTime() - s.login_at.getTime()) / 60000
    ))
    await s.save()
  }

  if (open.length > 0) {
    logger.info({ count: open.length }, "[midnight-clock-out] Closed open sessions from previous days")
  }
}

let cronTask: ReturnType<typeof cron.schedule> | null = null

export function startMidnightClockOut(): void {
  // Run immediately on startup to catch any sessions missed while server was down
  closeOpenSessions().catch(err => logger.error({ err }, "[midnight-clock-out] Startup run error"))

  // Schedule at 00:00 IST every night (cron timezone option)
  cronTask = cron.schedule("0 0 * * *", async () => {
    try {
      await closeOpenSessions()
    } catch (err) {
      logger.error({ err }, "[midnight-clock-out] Scheduled run error")
    }
  }, { timezone: "Asia/Kolkata" })

  logger.info("[midnight-clock-out] Scheduled for 00:00 IST daily")
}

export function stopMidnightClockOut(): void {
  cronTask?.stop()
  cronTask = null
}
