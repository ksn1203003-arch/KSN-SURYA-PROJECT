// ─────────────────────────────────────────────────────────────────────────────
// lib/validateEnv.ts — Environment variable validation on server startup.
// Crashes the server in production if required variables are missing or insecure.
// Exports: validateEnv()
// ─────────────────────────────────────────────────────────────────────────────
import { logger } from "./logger.js"

// Checks required and recommended env vars; throws in production if any are missing
export function validateEnv() {
  const isProd = process.env.NODE_ENV === "production"

  const required: Array<{ key: string; description: string }> = [
    { key: "MONGODB_URI",    description: "MongoDB connection string" },
    { key: "JWT_SECRET",     description: "JWT signing secret (min 32 chars)" },
    { key: "FRONTEND_URL",   description: "Frontend origin for CORS (e.g. https://app.teachscript.in)" },
  ]

  const recommended: Array<{ key: string; description: string }> = [
    { key: "APPROVAL_SECRET",   description: "HMAC secret for signup approval links" },
    { key: "BACKEND_URL",       description: "This server's public URL (for email links)" },
    { key: "ANTHROPIC_API_KEY", description: "Claude AI API key" },
    { key: "REDIS_URL",         description: "Redis URL for distributed auth cache (required in multi-process deployments)" },
  ]

  const missing: string[] = []
  const warnings: string[] = []

  for (const { key, description } of required) {
    if (!process.env[key]) {
      missing.push(`  ❌ ${key} — ${description}`)
    }
  }

  for (const { key, description } of recommended) {
    if (!process.env[key]) {
      warnings.push(`  ⚠️  ${key} — ${description} (feature will be disabled)`)
    }
  }

  if (warnings.length > 0) {
    logger.warn({ missingOptional: warnings }, "[TeachScript] Optional env vars not set — affected features will be disabled")
  }

  // JWT_SECRET must be at least 32 characters to be cryptographically safe
  const jwtSecret = process.env.JWT_SECRET ?? ""
  if (jwtSecret.length > 0 && jwtSecret.length < 32) {
    missing.push(`  ❌ JWT_SECRET is too short (${jwtSecret.length} chars — minimum 32 required)`)
  }
  if (jwtSecret === "dev-secret-change-in-production") {
    missing.push(`  ❌ JWT_SECRET is using the insecure default placeholder — set a real secret`)
  }

  if (missing.length > 0) {
    const msg = `[TeachScript] Missing required environment variables: ${missing.join(" | ")} — set these before starting the server.`
    if (isProd) {
      throw new Error(msg)
    } else {
      logger.warn({ missingRequired: missing }, "[TeachScript] Missing required env vars — continuing in development mode with defaults")
    }
  } else {
    logger.info("[TeachScript] Environment validated")
  }
}
