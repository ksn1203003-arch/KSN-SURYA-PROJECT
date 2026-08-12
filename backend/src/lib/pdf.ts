// ─────────────────────────────────────────────────────────────────────────────
// lib/pdf.ts — Certificate PDF generator using Puppeteer.
// Renders an HTML certificate template to a PDF buffer, fetching the school
// logo from GridFS if one is configured.
// Exports: generateCertificatePDF(), CertificateData
// ─────────────────────────────────────────────────────────────────────────────
import puppeteer from "puppeteer"
import fs from "fs"
import path from "path"
import https from "https"
import { fileURLToPath } from "url"
import { logger } from "./logger.js"

// ESM does not define __dirname — derive it from import.meta.url
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

export interface CertificateData {
  student_name:   string
  module_title:   string
  subject:        string
  class_label:    string
  school_name:    string
  logo_base64?:   string
  logo_mime?:     string
  description:    string
  footer_left:    string
  footer_right:   string
  accent_color:   string
  date:           string
  cert_title?:    string
  cert_subtitle?: string
  template?:      "completion" | "default" | "outstanding_achievement" | "academic_excellence"
}

export function fillDescription(template: string, data: Pick<CertificateData, "module_title" | "subject" | "class_label" | "student_name" | "school_name">): string {
  let result = template
    .replace(/\{module\}/g,  data.module_title)
    .replace(/\{subject\}/g, data.subject)
    .replace(/\{class\}/g,   data.class_label)
    .replace(/\{student\}/g, data.student_name)
    .replace(/\{school\}/g,  data.school_name)

  // Subject-level certs store module_title = subject (no real module title).
  // This collapses "Computer Science in Computer Science" → "Computer Science".
  if (data.module_title === data.subject && data.subject) {
    const escaped = data.subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    result = result.replace(new RegExp(`${escaped}\\s+in\\s+${escaped}`, "g"), data.subject)
  }

  return result
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Cache templates in memory so we only read each file once per process
let _completionCache:       string | null = null
let _outstandingCache:      string | null = null
let _outstandingLoadPromise: Promise<string> | null = null
let _academicCache:         string | null = null

function loadTemplate(): string {
  if (!_completionCache) {
    const templatePath = path.join(__dirname, "..", "templates", "certificate.htm")
    _completionCache = fs.readFileSync(templatePath, "utf-8")
  }
  return _completionCache
}

function fetchImageAsBase64(url: string, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (c: Buffer) => chunks.push(c))
      res.on("end", () => {
        const b64 = Buffer.concat(chunks).toString("base64")
        const mime = (res.headers["content-type"] ?? "image/png") as string
        resolve(`data:${mime};base64,${b64}`)
      })
    })
    req.on("error", reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`fetchImageAsBase64 timed out after ${timeoutMs}ms for: ${url}`))
    })
  })
}

export async function warmOutstandingTemplate(): Promise<void> {
  await loadOutstandingTemplateAsync().catch(err =>
    logger.warn({ err }, "[pdf] Outstanding template pre-warm failed — will retry on first certificate request")
  )
}

async function loadOutstandingTemplateAsync(): Promise<string> {
  if (_outstandingCache) return _outstandingCache

  // Use a promise singleton to prevent concurrent callers from each fetching
  // all external images independently when the cache is cold.
  if (_outstandingLoadPromise) return _outstandingLoadPromise

  _outstandingLoadPromise = (async () => {
    const templatePath = path.join(__dirname, "..", "templates", "badge-certificate.htm")
    let html = fs.readFileSync(templatePath, "utf-8")
    const externalImgRe = /src="(https:\/\/editors-cdn\.template\.net\/[^"]+)"/g
    const urls = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = externalImgRe.exec(html)) !== null) urls.add(m[1])
    for (const url of urls) {
      try {
        const dataUri = await fetchImageAsBase64(url)
        html = html.replaceAll(`src="${url}"`, `src="${dataUri}"`)
      } catch { /* leave original src if fetch fails */ }
    }
    _outstandingCache = html
    _outstandingLoadPromise = null
    return html
  })()

  return _outstandingLoadPromise
}

function loadOutstandingTemplate(): string {
  if (!_outstandingCache) {
    const templatePath = path.join(__dirname, "..", "templates", "badge-certificate.htm")
    _outstandingCache = fs.readFileSync(templatePath, "utf-8")
  }
  return _outstandingCache
}

// ── Completion certificate — rendered directly from the .htm template ─────────
// The template has a dark-navy + gold design with all SVG assets embedded.
// We replace only the 4 dynamic text nodes using their exact layer IDs.
function assertReplaced(html: string, placeholder: string, context: string): void {
  if (html.includes(placeholder)) {
    throw new Error(`[pdf] buildCompletionHTML: placeholder not replaced — ${context}. Template may have changed.`)
  }
}

function buildCompletionHTML(data: CertificateData): string {
  let html = loadTemplate()

  // 1. Student name  (layer DVyn8XyL_)
  const PLACEHOLDER_NAME = "<p>Roberto&nbsp; Murphy</p>"
  html = html.replace(PLACEHOLDER_NAME, `<p>${esc(data.student_name)}</p>`)
  assertReplaced(html, PLACEHOLDER_NAME, "student name")

  // 2. Description + date  (layer rTj64ovQH — 3 <p> block)
  //    Teacher-issued: show cert title on first line, reason on second.
  //    Auto-generated (module completion): show normal description paragraphs.
  const descBlock = data.cert_title
    ? `<p>${esc(data.cert_title)}</p><p>${esc(data.description)}</p><p>on ${esc(data.date)}.</p>`
    : data.description
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => `<p>${esc(l)}</p>`)
        .join("") + `<p>on ${esc(data.date)}.</p>`

  const PLACEHOLDER_DESC =
    `<p>has successfully completed the requirements for</p>` +
    `<p>the High School Diploma at&nbsp;` +
    `<a class="primary-field" data-primary-uuid="id-uujrBn3m_" data-primary-field="companyName">` +
    `Maplewood High School</a>&nbsp;</p>` +
    `<p>on the 15th of May 2060.</p>`
  html = html.replace(PLACEHOLDER_DESC, descBlock)
  assertReplaced(html, PLACEHOLDER_DESC, "description block")

  // 3. Principal / signer name  (layer W1Ry7-7P2)
  const PLACEHOLDER_SIGNER =
    `<p><a class="primary-field" data-primary-uuid="id-jXM8HlL-M" data-primary-field="yourName">` +
    `Jane Smith</a></p>`
  html = html.replace(PLACEHOLDER_SIGNER, `<p>${esc(data.footer_right)}</p>`)
  assertReplaced(html, PLACEHOLDER_SIGNER, "signer name")

  // 4. School name under signature  (layer xPqBU8wba)
  const PLACEHOLDER_SCHOOL =
    `<p><a class="primary-field" data-primary-uuid="id-zZa0AuUce" data-primary-field="companyName">` +
    `Maplewood High School</a></p>`
  html = html.replace(PLACEHOLDER_SCHOOL, `<p>${esc(data.school_name)}</p>`)
  assertReplaced(html, PLACEHOLDER_SCHOOL, "school name")

  // 5. School logo watermark — centred inside the background canvas layer at low opacity
  if (data.logo_base64) {
    const watermark =
      `<img src="data:${data.logo_mime ?? "image/png"};base64,${data.logo_base64}" ` +
      `style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);` +
      `width:900px;height:900px;object-fit:cover;border-radius:50%;` +
      `opacity:0.3;z-index:0;pointer-events:none;"/>`
    html = html.replace(
      `<div id="block-container-6p_evmsbl" data-blockindex="0" class="sc-cPjxvi iPJbNq background-layer graphic-layer" style="opacity: 1; background: rgb(255, 252, 245);"></div>`,
      `<div id="block-container-6p_evmsbl" data-blockindex="0" class="sc-cPjxvi iPJbNq background-layer graphic-layer" style="opacity: 1; background: rgb(255, 252, 245);">${watermark}</div>`
    )
  }

  // 6. Fix single-page rendering.
  //    The template's .jCFaJp uses transform:scale(0.295098) which is visual-only —
  //    the layout dimensions stay at 3300×2550 px, causing Puppeteer to create 3 pages.
  //    Replacing it with CSS zoom (layout-affecting) makes both visual AND layout = 974×752 px,
  //    so Puppeteer generates exactly 1 page.
  html = html.replace(
    "</head>",
    `<style>
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 974px !important;
        height: 752px !important;
        overflow: hidden !important;
        background: transparent !important;
      }
      /* zoom shrinks layout dimensions (unlike transform:scale which is visual-only) */
      .jCFaJp {
        position: static !important;
        transform: none !important;
        zoom: 0.295098 !important;
      }
    </style>
    </head>`
  )

  return html
}

// ── Default certificate (custom / special awards) — original design ───────────
function buildDefaultHTML(data: CertificateData): string {
  const logoTag = data.logo_base64
    ? `<img src="data:${data.logo_mime ?? "image/png"};base64,${data.logo_base64}" class="logo-img" alt="School Logo" />`
    : `<div class="logo-placeholder"><span>${esc(data.school_name).charAt(0).toUpperCase()}</span></div>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 960px; height: 680px;
      font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
      background: #fff;
      display: flex; align-items: center; justify-content: center;
    }
    .cert {
      width: 920px; height: 648px; position: relative;
      background: #fff; border: 1.5px solid #e5e7eb;
      border-radius: 16px; overflow: hidden; display: flex; flex-direction: column;
    }
    .top-bar { height: 8px; background: linear-gradient(90deg, ${esc(data.accent_color)}, ${esc(data.accent_color)}99); flex-shrink: 0; }
    .corner { position: absolute; width: 60px; height: 60px; border-color: ${esc(data.accent_color)}33; border-style: solid; }
    .corner-tl { top: 16px; left: 16px; border-width: 2px 0 0 2px; border-radius: 4px 0 0 0; }
    .corner-tr { top: 16px; right: 16px; border-width: 2px 2px 0 0; border-radius: 0 4px 0 0; }
    .corner-bl { bottom: 16px; left: 16px; border-width: 0 0 2px 2px; border-radius: 0 0 0 4px; }
    .corner-br { bottom: 16px; right: 16px; border-width: 0 2px 2px 0; border-radius: 0 0 4px 0; }
    .body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 32px 64px 36px; }
    .header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .logo-img { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
    .logo-placeholder { width: 52px; height: 52px; border-radius: 10px; background: linear-gradient(135deg, ${esc(data.accent_color)}, ${esc(data.accent_color)}99); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: #fff; }
    .school-name { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 2px; }
    .divider { width: 40px; height: 2px; background: ${esc(data.accent_color)}44; border-radius: 1px; }
    .cert-title { text-align: center; }
    .cert-title h1 { font-size: 28px; font-weight: 800; color: ${esc(data.accent_color)}; letter-spacing: -0.5px; margin-bottom: 4px; }
    .cert-title p { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 3px; }
    .student-section { text-align: center; }
    .presented { font-size: 12px; color: #9ca3af; margin-bottom: 6px; letter-spacing: 1px; text-transform: uppercase; }
    .student-name { font-size: 36px; font-weight: 300; color: #111827; letter-spacing: -1px; margin-bottom: 12px; border-bottom: 1.5px solid ${esc(data.accent_color)}22; padding-bottom: 12px; }
    .description { font-size: 13px; color: #6b7280; line-height: 1.8; max-width: 560px; }
    .footer { width: 100%; display: flex; justify-content: space-between; align-items: flex-end; }
    .sig { text-align: center; }
    .sig-line { width: 150px; height: 1px; background: #d1d5db; margin-bottom: 6px; }
    .sig-name { font-size: 12px; font-weight: 700; color: #374151; }
    .sig-role { font-size: 10px; color: #9ca3af; margin-top: 2px; }
    .center-badge { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .badge-circle { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, ${esc(data.accent_color)}, ${esc(data.accent_color)}99); display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .badge-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.5px; }
    .badge-date  { font-size: 10px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="cert">
    <div class="top-bar"></div>
    <div class="corner corner-tl"></div><div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div><div class="corner corner-br"></div>
    <div class="body">
      <div class="header">
        ${logoTag}
        <p class="school-name">${esc(data.school_name)}</p>
        <div class="divider"></div>
      </div>
      <div class="cert-title">
        <h1>${esc(data.cert_title ?? "Certificate of Achievement")}</h1>
        <p>${esc(data.cert_subtitle ?? "TeachScript · Academic Programme")}</p>
      </div>
      <div class="student-section">
        <p class="presented">This certificate is proudly presented to</p>
        <p class="student-name">${esc(data.student_name)}</p>
        <p class="description">${esc(data.description).replace(/\n/g, "<br/>")}</p>
      </div>
      <div class="footer">
        <div class="sig">
          <div class="sig-line"></div>
          <p class="sig-name">${esc(data.footer_left)}</p>
          <p class="sig-role">Class Teacher</p>
        </div>
        <div class="center-badge">
          <div class="badge-circle">🏆</div>
          <p class="badge-label">Certified</p>
          <p class="badge-date">${esc(data.date)}</p>
        </div>
        <div class="sig">
          <div class="sig-line"></div>
          <p class="sig-name">${esc(data.footer_right)}</p>
          <p class="sig-role">School Principal</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ── Outstanding Achievement certificate — rendered from badge-certificate.htm ─
// Canvas: 1056×816 px, CSS class .kmsnan scales at 0.943431 (visual-only transform).
// We replace the 4 dynamic text nodes and fix the scale with CSS zoom so Puppeteer
// generates exactly 1 page at the correct layout size (~996×770 px).
async function buildOutstandingHTML(data: CertificateData): Promise<string> {
  let html = await loadOutstandingTemplateAsync()

  // 1. Student name  (<p> inside styled div layer)
  html = html.replace(
    "<p>Alan K. Granger</p>",
    `<p>${esc(data.student_name)}</p>`
  )

  // 2. Description line — teacher-issued: title on first line, reason below;
  //    auto-generated: normal description only
  const outstandingDesc = data.cert_title
    ? `<p>${esc(data.cert_title)}</p><p>${esc(data.description)}</p>`
    : `<p>${esc(data.description)}</p>`
  html = html.replace(
    "<p>For his outstanding performance in customer service.</p>",
    outstandingDesc
  )

  // 3. Date line — removed from outstanding achievement cert
  html = html.replace("<p>Given this 16th of July 2050.</p>", "")

  // 4. Signer name  (inside <a data-primary-field="yourName">)
  html = html.replace(
    `>William A. Spencer</a>`,
    `>${esc(data.footer_right)}</a>`
  )

  // 5. Company / school name  (inside <a data-primary-field="companyName">)
  html = html.replace(
    `>Cascade Solutions</a>`,
    `>${esc(data.school_name)}</a>`
  )

  // 6a. Remove "Signed:" label — it renders too high above the signer name
  html = html.replace("<p>Signed:</p>", "")

  // 6b. Role label — replace "Legal Counsel" with "School Principal"
  html = html.replace(
    "<p>Legal Counsel</p>",
    "<p>School Principal</p>"
  )

  // 7. School logo watermark — positioned behind the student name area at 0.3 opacity
  //    The name sits at ~42% from top, ~55% from left on the 1056×816 canvas
  if (data.logo_base64) {
    const watermark =
      `<img src="data:${data.logo_mime ?? "image/png"};base64,${data.logo_base64}" ` +
      `style="position:absolute;top:48%;left:55%;transform:translate(-50%,-50%);` +
      `width:285px;height:285px;object-fit:cover;border-radius:50%;` +
      `opacity:0.3;z-index:0;pointer-events:none;"/>`
    html = html.replace(
      `<div id="block-container-HQS3sHpQ4" data-blockindex="0" class="sc-kMbsOZ raMdt background-layer graphic-layer" style="opacity: 1; background: rgb(255, 255, 255);"></div>`,
      `<div id="block-container-HQS3sHpQ4" data-blockindex="0" class="sc-kMbsOZ raMdt background-layer graphic-layer" style="opacity: 1; background: rgb(255, 255, 255);">${watermark}</div>`
    )
  }

  // 9. Fix single-page rendering — replace visual-only transform:scale with layout-affecting zoom.
  //    Do NOT override position (absolute child layers like the gold design depend on it).
  html = html.replace(
    "</head>",
    `<style>
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 996px !important;
        height: 770px !important;
        overflow: hidden !important;
        background: transparent !important;
      }
      .kmsnan {
        transform: none !important;
        zoom: 0.943431 !important;
      }
    </style>
    </head>`
  )

  return html
}

// ── Academic Excellence certificate — rendered from academic-excellence.svg ───
// SVG canvas: 2800×2000. Rendered at 50% = 1400×1000 px.
// Student name (calligraphic path art) is removed and replaced with SVG <text>
// using Dancing Script loaded from Google Fonts via the HTML wrapper.
function buildAcademicHTML(data: CertificateData): string {
  if (!_academicCache) {
    const templatePath = path.join(__dirname, "..", "templates", "academic-excellence.svg")
    _academicCache = fs.readFileSync(templatePath, "utf-8")
  }
  let svg = _academicCache

  // 1. Crop SVG to the cert frame with a small padding so the gold border stroke is
  //    fully visible and no artifacts from the outer background bleed in at the edges
  svg = svg.replace(
    `viewBox="0 0 2800 2000"`,
    `viewBox="168 127 2482 1746"`
  )

  // 2. Remove calligraphic "Name Surname" path group (10KB of vector art)
  svg = svg.replace(/\s*<g>\s*<path class="st17" d="M1216\.9,1056\.4[\s\S]*?<\/g>/, "")

  // 3. Student name — SVG <text> in Dancing Script, centred in the white content area
  //    Content area centre in SVG coords: x≈1660, y≈1060 (below the underline at y=1113)
  const nameEl =
    `<text x="1660" y="1080" text-anchor="middle" ` +
    `font-family="'Dancing Script', cursive" font-size="130" font-weight="700" fill="#0A181E">` +
    `${esc(data.student_name)}</text>`
  svg = svg.replace("</svg>", `${nameEl}</svg>`)

  // 4. School name — top-right inside cert, clearly below the gold top border (y=135.7)
  //    Placed at y=360/420 — roughly 127px below top border in rendered space
  const [schoolLine1, schoolLine2] = esc(data.school_name).split(", ")
  const schoolEl =
    `<text x="2580" y="258" text-anchor="end" ` +
    `font-family="'Julius Sans One', sans-serif" font-size="42" font-weight="700" ` +
    `letter-spacing="3" fill="#0A181E">` +
    `<tspan x="2580" dy="0">${schoolLine1 ?? esc(data.school_name)}</tspan>` +
    `<tspan x="2580" dy="56">${schoolLine2 ?? ""}</tspan></text>`
  svg = svg.replace("</svg>", `${schoolEl}</svg>`)

  // 5. Description — teacher-issued: title first line, reason second;
  //    auto-generated: single description line centred
  const descBlock = data.cert_title
    ? `<tspan x="0" dy="0" class="st14 st15">${esc(data.cert_title)}</tspan>` +
      `<tspan x="0" dy="65" class="st14 st15">${esc(data.description)}</tspan>`
    : `<tspan x="0" dy="0" class="st14 st15">${esc(data.description)}</tspan>`
  svg = svg.replace(
    /<text transform="matrix\(1 0 0 1 1024\.2345 1258\.6125\)">[\s\S]*?<\/text>/,
    `<text transform="matrix(1 0 0 1 1660 1258.6125)" text-anchor="middle">${descBlock}</text>`
  )

  // 6. Date — value ABOVE the left signature line (y=1661), label below it
  svg = svg.replace(
    `<text transform="matrix(1 0 0 1 1092.0879 1741.9996)" class="st11 st18">date</text>`,
    `<text x="1155" y="1635" text-anchor="middle" class="st11 st18">${esc(data.date)}</text>` +
    `<text x="1155" y="1720" text-anchor="middle" class="st14 st16">Date</text>`
  )

  // 7. Signature — value ABOVE the right signature line (y=1661), label below it
  svg = svg.replace(
    `<text transform="matrix(1 0 0 1 2088.4587 1741.9998)" class="st11 st18">signature</text>`,
    `<text x="2233" y="1635" text-anchor="middle" class="st11 st18">${esc(data.footer_right)}</text>` +
    `<text x="2233" y="1720" text-anchor="middle" class="st14 st16">School Principal</text>`
  )

  // 8. Watermark — school logo behind the name, small at 0.3 opacity
  if (data.logo_base64) {
    const wm =
      `<image x="1360" y="750" width="600" height="600" preserveAspectRatio="xMidYMid meet" ` +
      `style="opacity:0.3;" href="data:${data.logo_mime ?? "image/png"};base64,${data.logo_base64}"/>`
    svg = svg.replace("</svg>", `${wm}</svg>`)
  }

  // Fonts inlined as system-safe stacks — no external CDN call at render time.
  // Puppeteer runs headless and may have no network access; external font links
  // cause silent fallback to a generic serif that breaks the certificate design.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1400px; height: 1000px; overflow: hidden; background: #fff; }
    svg { width: 1400px; height: 1000px; display: block; }
    .st18 { font-family: "Georgia", "Palatino Linotype", "Book Antiqua", serif; font-style: italic; }
    .st16 { font-family: "Trebuchet MS", "Gill Sans", "Century Gothic", sans-serif; letter-spacing: 2px; }
  </style>
</head>
<body>${svg}</body>
</html>`
}

// ── Concurrency semaphore ──────────────────────────────────────────────────────
// Limits simultaneous Puppeteer PDF renders to 3.
// Beyond that, callers queue rather than spawning unlimited Chromium pages.
const MAX_CONCURRENT_PDF = 3
let _pdfActive = 0
const _pdfQueue: Array<() => void> = []

function acquirePdfSlot(): Promise<void> {
  return new Promise(resolve => {
    if (_pdfActive < MAX_CONCURRENT_PDF) {
      _pdfActive++
      resolve()
    } else {
      _pdfQueue.push(resolve)
    }
  })
}

function releasePdfSlot(): void {
  const next = _pdfQueue.shift()
  if (next) {
    next() // hand the slot to the next waiter (count stays the same)
  } else {
    _pdfActive--
  }
}

// ── Circuit breaker ────────────────────────────────────────────────────────────
// Tracks consecutive Puppeteer failures. After 3 failures within the window the
// breaker opens and rejects all PDF requests for 60 seconds, preventing the
// already-broken Chromium instance from being hammered further.
// States: closed (normal) → open (rejecting) → half-open (one trial allowed).
const CB_THRESHOLD   = 3
const CB_RESET_MS    = 60_000

type CBState = "closed" | "open" | "half-open"
let _cbState:    CBState = "closed"
let _cbFailures  = 0
let _cbOpenedAt  = 0

function cbAllow(): boolean {
  if (_cbState === "closed") return true
  if (_cbState === "open") {
    if (Date.now() - _cbOpenedAt >= CB_RESET_MS) {
      _cbState = "half-open"
      return true
    }
    return false
  }
  return true // half-open: allow one trial
}

function cbSuccess(): void {
  _cbState    = "closed"
  _cbFailures = 0
}

function cbFailure(): void {
  _cbFailures++
  if (_cbState === "half-open" || _cbFailures >= CB_THRESHOLD) {
    _cbState   = "open"
    _cbOpenedAt = Date.now()
    _cbFailures = 0
  }
}

// ── Singleton Puppeteer browser ────────────────────────────────────────────────
// Launching Chrome per request takes ~2-3 seconds and leaks processes on errors.
// We keep one browser alive for the process lifetime; each PDF gets its own page
// (opened and closed within the request) so rendering is fully isolated.
//
// Render counter: Chromium accumulates memory over many renders. After
// PUPPETEER_RESTART_AFTER renders (default 200), we close and relaunch
// the browser so its heap doesn't grow unbounded across long-lived server processes.
import type { Browser } from "puppeteer"
let _browser: Browser | null = null
let _launchPromise: Promise<Browser> | null = null
let _renderCount = 0
const PUPPETEER_RESTART_AFTER = parseInt(process.env.PUPPETEER_RESTART_AFTER ?? "200", 10) || 200

/** Returns the live browser singleton without launching one — safe to call from health checks. */
export function getPuppeteerStatus(): { running: boolean; renderCount: number; restartThreshold: number } {
  return { running: _browser !== null, renderCount: _renderCount, restartThreshold: PUPPETEER_RESTART_AFTER }
}

export async function getBrowser(): Promise<Browser> {
  // Fast path: browser is alive
  if (_browser) {
    try {
      await _browser.version()
      return _browser
    } catch {
      _browser = null
      _launchPromise = null
    }
  }

  // If a launch is already in progress, wait for it instead of starting a second one.
  // This prevents the race where two concurrent callers both see _browser===null
  // and both call puppeteer.launch(), orphaning the first Chromium process.
  if (_launchPromise) return _launchPromise

  _launchPromise = puppeteer
    .launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })
    .then(browser => {
      _browser = browser
      _launchPromise = null
      browser.on("disconnected", () => { _browser = null; _launchPromise = null })
      return browser
    })
    .catch(err => {
      _launchPromise = null
      throw err
    })

  return _launchPromise
}

// ── Shared HTML→PDF renderer (semaphore + circuit breaker included) ────────────
// Use this for any Puppeteer-based PDF that isn't a certificate template.
// It goes through the same 3-slot semaphore and circuit breaker as certificates,
// preventing report card generation from bypassing the concurrency limit.
export async function renderHtmlToPdf(
  html: string,
  opts: { width?: number; height?: number; format?: "A4" | "A3" } = {}
): Promise<Buffer> {
  if (!cbAllow()) {
    throw new Error("PDF service is temporarily unavailable. Please try again in a moment.")
  }
  await acquirePdfSlot()
  // Periodic browser restart to prevent Chromium heap growth over many renders.
  // Increment before rendering; if the threshold is crossed, close and let getBrowser()
  // relaunch a fresh instance. A concurrent render may also trigger a relaunch — that
  // is fine because getBrowser() serialises the launch via _launchPromise.
  _renderCount++
  if (_renderCount >= PUPPETEER_RESTART_AFTER && _browser) {
    logger.info({ renderCount: _renderCount }, "[pdf] Restarting Puppeteer browser after render threshold")
    _renderCount = 0
    const old = _browser
    _browser = null
    _launchPromise = null
    old.close().catch(() => {})
  }
  const browser = await getBrowser()
  const page    = await browser.newPage()
  try {
    const vpW = opts.width  ?? 900
    const vpH = opts.height ?? 600
    await page.setViewport({ width: vpW, height: vpH })
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 20000 })
    const pdfData = opts.format
      ? await page.pdf({ format: opts.format, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } })
      : await page.pdf({ format: "A4",        printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } })
    cbSuccess()
    return Buffer.from(pdfData)
  } catch (err) {
    cbFailure()
    throw err
  } finally {
    await page.close().catch(() => {})
    releasePdfSlot()
  }
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function generateCertificatePDF(data: CertificateData): Promise<Buffer> {
  const isCompletion  = data.template === "completion"
  const isOutstanding = data.template === "outstanding_achievement"
  const isAcademic    = data.template === "academic_excellence"

  let html: string
  let pdfWidth: string; let pdfHeight: string
  let vpWidth:  number; let vpHeight:  number

  if (isCompletion) {
    html = buildCompletionHTML(data)
    pdfWidth = "974px"; pdfHeight = "752px"; vpWidth = 974; vpHeight = 752
  } else if (isOutstanding) {
    html = await buildOutstandingHTML(data)
    pdfWidth = "996px"; pdfHeight = "770px"; vpWidth = 996; vpHeight = 770
  } else if (isAcademic) {
    html = buildAcademicHTML(data)
    pdfWidth = "1400px"; pdfHeight = "1000px"; vpWidth = 1400; vpHeight = 1000
  } else {
    html = buildDefaultHTML(data)
    pdfWidth = "960px"; pdfHeight = "680px"; vpWidth = 960; vpHeight = 680
  }

  // ── White print border — 30 px on all four sides ─────────────────────────
  // Expands the PDF canvas by 60 px in each dimension and positions the cert
  // body inward so a clean white margin surrounds the design on paper.
  const MARGIN = 30
  const outerW = vpWidth  + 2 * MARGIN
  const outerH = vpHeight + 2 * MARGIN
  html = html.replace(
    "</head>",
    `<style>
      html {
        width:  ${outerW}px !important;
        height: ${outerH}px !important;
        background: white !important;
        overflow: hidden !important;
      }
      body {
        position: absolute !important;
        top:  ${MARGIN}px !important;
        left: ${MARGIN}px !important;
        width:  ${vpWidth}px  !important;
        height: ${vpHeight}px !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    </style></head>`
  )
  pdfWidth  = `${outerW}px`
  pdfHeight = `${outerH}px`

  if (!cbAllow()) {
    throw new Error("PDF service is temporarily unavailable. Please try again in a moment.")
  }

  await acquirePdfSlot()
  const browser = await getBrowser()
  const page    = await browser.newPage()
  try {
    await page.setViewport({ width: outerW, height: outerH })

    await page.setRequestInterception(true)
    page.on("request", req => {
      const url = req.url()
      // Block template.net CDN fonts (decorative fonts not used in cert) to prevent hangs.
      // Allow Google Fonts (Poppins) and everything else (inline data URIs, etc.)
      if (url.includes("editors-cdn.template.net")) {
        req.abort()
      } else {
        req.continue()
      }
    })

    // networkidle2 waits for Google Fonts (Poppins) to finish, then settles quickly
    await page.setContent(html, { waitUntil: "networkidle2", timeout: 30000 })
    const pdfData = await page.pdf({ width: pdfWidth, height: pdfHeight, printBackground: true })
    cbSuccess()
    return Buffer.from(pdfData)
  } catch (err) {
    cbFailure()
    throw err
  } finally {
    await page.close().catch(() => {})
    releasePdfSlot()
  }
}
