import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client"

export const registry = new Registry()

// Collect default Node.js metrics (event loop lag, GC, heap, process CPU)
collectDefaultMetrics({ register: registry, prefix: "teachscript_" })

// HTTP request counter
export const httpRequestCounter = new Counter({
  name: "teachscript_http_requests_total",
  help: "Total HTTP requests by method, route, and status",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
})

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: "teachscript_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
})

// AI requests counter
export const aiRequestCounter = new Counter({
  name: "teachscript_ai_requests_total",
  help: "Total AI assistant requests",
  labelNames: ["status"] as const,
  registers: [registry],
})

// PDF generation counter
export const pdfGenerationCounter = new Counter({
  name: "teachscript_pdf_generations_total",
  help: "Total PDF generation requests by type and path",
  labelNames: ["type", "path"] as const,
  registers: [registry],
})

// BullMQ job counters
export const bullmqJobCounter = new Counter({
  name: "teachscript_bullmq_jobs_total",
  help: "Total BullMQ jobs by queue and outcome",
  labelNames: ["queue", "outcome"] as const,
  registers: [registry],
})
