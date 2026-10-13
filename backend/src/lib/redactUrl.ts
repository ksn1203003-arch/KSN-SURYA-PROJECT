// ─────────────────────────────────────────────────────────────────────────────
// lib/redactUrl.ts — Removes secret values from a URL before it is logged.
// Video stream links (?st=), one-time file links (?ft=) and reset/invite links
// (?token=) carry access tokens; a log line must never be enough to replay one.
// ─────────────────────────────────────────────────────────────────────────────
const SECRET_PARAMS = /([?&](?:st|ft|token)=)[^&#]*/gi

export function redactUrl(url: string | undefined): string {
  return (url ?? "").replace(SECRET_PARAMS, "$1[redacted]")
}

/** What the request logger writes for each request: method, address without secrets, request id. */
export function serializeRequestForLog(req: { method?: string; url?: string; id?: unknown }): { method?: string; url: string; id?: unknown } {
  return { method: req.method, url: redactUrl(req.url), id: req.id }
}
