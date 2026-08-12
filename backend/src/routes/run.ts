// ─────────────────────────────────────────────────────────────────────────────
// routes/run.ts — Code execution route at /api/run.
//
// Execution strategy (in priority order):
//   1. Piston API (PISTON_URL env var) — fully isolated container sandbox.
//      Self-host: https://github.com/engineer-man/piston (single Docker container).
//      This is the only production-safe approach for student code execution.
//   2. Fallback — rejects the request with a 503 and a clear message when
//      Piston is not configured, rather than running untrusted code on the server.
//
// To enable: add PISTON_URL=http://piston:2000 to backend/.env and start
// the Piston container alongside the app (see docker-compose.yml comments).
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express"
import { requireAuth } from "../middleware/auth.js"
import { logger } from "../lib/logger.js"

const router = Router()

const MAX_CODE       = 10_000   // chars
const MAX_OUTPUT_LEN = 50_000   // chars
const TIMEOUT_MS     = 10_000   // 10 s — passed to Piston as run_timeout

// Piston language runtime identifiers
// https://github.com/engineer-man/piston#supported-languages
const PISTON_LANGUAGE: Record<string, { language: string; version: string }> = {
  python:     { language: "python",     version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  html:       { language: "html",       version: "5" },
}

interface PistonResponse {
  run?: {
    stdout: string
    stderr: string
    code:   number
    signal: string | null
  }
  compile?: {
    stdout: string
    stderr: string
    code:   number
  }
  message?: string  // Piston error message
}

router.post("/", requireAuth, async (req, res) => {
  const pistonUrl = process.env.PISTON_URL?.replace(/\/$/, "")

  if (!pistonUrl) {
    res.status(503).json({
      error: "Code execution is not available. The sandbox service (Piston) is not configured. Set PISTON_URL in your environment.",
    })
    return
  }

  const { code, language } = req.body as { code?: string; language?: string }

  if (typeof code !== "string" || code.length === 0) {
    res.status(400).json({ error: "code is required" }); return
  }
  if (code.length > MAX_CODE) {
    res.status(400).json({ error: `Code exceeds the ${MAX_CODE.toLocaleString()} character limit` }); return
  }

  const lang = (language ?? "python").toLowerCase()
  const runtime = PISTON_LANGUAGE[lang]
  if (!runtime) {
    res.status(400).json({ error: `Language '${lang}' is not supported. Supported: ${Object.keys(PISTON_LANGUAGE).join(", ")}` }); return
  }

  try {
    const pistonRes = await fetch(`${pistonUrl}/api/v2/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language:        runtime.language,
        version:         runtime.version,
        files:           [{ name: `main.${lang === "javascript" ? "js" : lang === "html" ? "html" : "py"}`, content: code }],
        stdin:           "",
        args:            [],
        run_timeout:     TIMEOUT_MS,
        compile_timeout: TIMEOUT_MS,
        run_memory_limit: 64 * 1024 * 1024,  // 64 MB
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS + 5_000),  // network timeout slightly beyond run timeout
    })

    if (!pistonRes.ok) {
      const text = await pistonRes.text().catch(() => "")
      logger.warn({ status: pistonRes.status, body: text }, "[run] Piston returned non-2xx")
      res.status(502).json({ error: "Code execution service returned an error. Please try again." }); return
    }

    const data = await pistonRes.json() as PistonResponse

    if (data.message) {
      res.status(400).json({ error: data.message }); return
    }

    const run = data.run
    if (!run) {
      res.status(502).json({ error: "Unexpected response from code execution service." }); return
    }

    // Truncate oversized output
    const stdout = run.stdout.length > MAX_OUTPUT_LEN
      ? run.stdout.slice(0, MAX_OUTPUT_LEN) + "\n… (output truncated)"
      : run.stdout

    const stderr = run.stderr.length > MAX_OUTPUT_LEN
      ? run.stderr.slice(0, MAX_OUTPUT_LEN) + "\n… (output truncated)"
      : run.stderr

    // Timed out: Piston sets signal="SIGKILL" and non-zero code
    if (run.signal === "SIGKILL") {
      res.json({ error: "⏱️ Execution timed out (10 s). Check for infinite loops." }); return
    }

    res.json({
      output: stdout.trim() || "(no output)",
      stderr: stderr.trim() || null,
    })
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      res.status(504).json({ error: "Code execution timed out waiting for the sandbox. Please try again." }); return
    }
    logger.error({ err }, "[run] Piston request failed")
    res.status(502).json({ error: "Could not reach the code execution service. Please try again." })
  }
})

export default router
