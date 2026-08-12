# CLAUDE.md — TeachScript (ClassroomAI)

## ⚡ CRITICAL — READ THIS EVERY MESSAGE

The feature-pipeline output style is always active. For EVERY request:
1. ALWAYS run Phase 1 + Phase 2 first — no exceptions
2. ALWAYS wait for ✅ APPROVE before writing any code
3. ALWAYS run Phase 5 testing after implementing
4. ALWAYS run Phase 6 confirmation when done
5. These rules apply to the 1st message AND the 50th message equally

---

## 1. What This App Is

**TeachScript** is a school classroom management platform for Indian schools (Classes 3–8). It serves four roles: teachers upload lessons and push coding challenges/quizzes/homework to their class; students consume lessons, attempt quizzes, write code, submit homework, and track their attendance and marks; admins manage the school's classes, teachers, students, and compliance; parents get a read-only view of their child's progress. The AI assistant (Claude Sonnet 4.6) helps teachers simplify concepts, generate activities, and translate content to Hindi for CBSE/State/ICSE curricula.

---

## 2. Full Tech Stack

### Frontend
| Layer | Tool / Version |
|---|---|
| Framework | React 19.2.4 |
| Router | React Router 7.14.2 |
| Build | Vite 7.3.1 |
| Styling | Tailwind CSS 4.2.1 + tailwind-merge |
| UI Components | shadcn/ui + Radix UI primitives |
| Icons | Lucide React |
| Charts | Recharts 3.8.0 |
| Forms | React Hook Form + Zod |
| Password strength | zxcvbn (score < 2 rejected on SetPasswordPage) |
| Excel Export | XLSX 0.18.5 |
| DOCX conversion | mammoth ^1.12.0 |
| PWA | vite-plugin-pwa + Workbox |
| E2E Tests | Playwright |
| Path alias | `@` → `frontend/src/` |

### Backend
| Layer | Tool / Version |
|---|---|
| Runtime | Node.js with tsx watch (dev) |
| Framework | Express 4.21.2 |
| Database | MongoDB via Mongoose 9.6.1 |
| Auth | bcryptjs 3.0.3 + jsonwebtoken 9.0.3 |
| AI | @anthropic-ai/sdk 0.32.1 (claude-sonnet-4-6) |
| Password strength | zxcvbn (backend validation: score < 2 rejected on change-password + reset-password) |
| File storage | GridFS (in MongoDB) via multer |
| PDF gen | Puppeteer 23.11.1 (singleton browser — `getBrowser()` in lib/pdf.ts) |
| PPTX→PDF | libreoffice-convert 1.8.1 |
| Email | Nodemailer 8.0.7 + Resend 4.0.0 |
| Payments | Razorpay 2.9.4 |
| Security | Helmet 8, CORS, express-rate-limit 7.4.1 |
| Logging | pino + pino-http (JSON structured logs with requestId) |
| Job queues | BullMQ (PPTX + PDF async workers) — optional Redis required |
| Cache | Redis (distributed auth cache) — optional, falls back to in-process Map |
| Error tracking | Sentry (optional — only if SENTRY_DSN set) |
| Unit tests | Vitest |
| Port | 4000 (default) |

---

## 3. User Roles and Features

### Student
- **Dashboard**: modules completed, points, quiz score %, attendance %, streak days, weekly activity chart, continue-learning shelf, upcoming events, classmates leaderboard
- **Lessons**: browse modules by subject, view PDF/file/video/Google Drive/YouTube items, progress tracked per item
- **Timetable**: read-only timetable from class schedule
- **Quizzes**: attempt MCQ quizzes, see score + explanations, one attempt per quiz
- **Homework**: view assigned homework with due dates and status badges (Pending/Done/Late); submit text answers; view teacher feedback and marks
- **My Marks**: view all exam results — marks per subject, percentage, letter grade (A+→F); download PDF report card
- **Certificates**: claim certificate when ≥70% of module items viewed; download as PDF
- **My Attendance**: calendar view of attendance by date; period-wise status (present/absent/late); attendance rate = `(present + late×0.5) / total`
- **Live Code Editor**: JavaScript/Python/HTML editor with iframe sandbox execution; teacher-assigned challenges with deadline; re-submit before deadline
- **Teachers**: view list of teachers in their class
- **Settings**: update name, language preference (English/Hindi), WhatsApp number, profile photo; request data deletion (DPDP Act 2023)

### Teacher
- **Dashboard**: student avg progress, quick-push challenge/quiz
- **Lessons**: create/rename/delete modules per subject+class; upload PPTX→PDF/video/images; add Drive/YouTube links; reorder modules and items via drag
- **Timetable**: configure day+period+subject+teacher+times for assigned classes
- **Attendance**: select date + class + period; mark each student present/absent/late; weight display (Present=100%, Late=50%, Absent=0%); cannot mark future dates
- **Students**: view class list, bulk add via CSV
- **Quizzes**: create MCQ quizzes (2–4 options), push to class, view per-student results
- **Homework**: create homework assignments (subject, title, description, due date) per class; view all student submissions; give written feedback and marks per submission
- **Marks**: create exams (unit test, mid-term, final, practical, other) with subjects and max marks; enter marks per student per subject; view class-wide results with percentage and letter grade; download individual student PDF report cards
- **Live Code**: create coding challenges (title, difficulty, language, description, constraints, expected output, deadline, class); view student submissions with expandable code preview
- **Certificates**: view issued certificates per class; customise certificate template (logo, colours, footer text); bulk download ZIP; issue custom certificates
- **AI Assistant**: ask lesson questions in English/Hindi; Claude responds with CBSE-aligned suggestions (30 requests/min per user)
- **Notifications**: broadcast announcements/reminders/achievements/alerts/events; schedule for later
- **Sunday Sync**: weekly planning tool
- **Settings**: profile photo, name, language; request data deletion (DPDP Act 2023)

### Admin
- **Overview**: school stats (teachers, students, classes), create new classes
- **Classes**: list all classes, edit name/subjects, view timetable audit trail (last 10 versions)
- **Teachers**: invite by email, assign to classes/subjects, bulk import CSV
- **Students**: add single or bulk CSV, assign to classes
- **Timetable**: view/edit timetables across all classes (conflict detection enforced)
- **Marks**: school-wide exam management and marks oversight
- **Certificates**: view all issued certificates school-wide
- **Reports**: activity PDF, board compliance report (Puppeteer PDF)
- **Data Requests**: DPDP Act 2023 compliance — review and approve/reject user data deletion requests; approved requests soft-deactivate the user
- **Notifications**: create school-wide announcements with scheduling
- **Settings**: school info (name, board, city, state, UDISE code), subscription plan

### Parent
- **Read-only portal**: view their linked child's attendance, lesson progress, quiz results, homework submissions, exam marks, and certificates
- **No write access**: parents cannot mark attendance, submit answers, or modify any data

---

## 4. Folder Structure

```
ClassroomAI/
├── CLAUDE.md                          # This file
├── README.md                          # Project overview and setup guide
├── docker-compose.yml                 # Production compose (backend + MongoDB + Redis)
├── docker-compose.override.yml        # Dev overrides (e.g. exposed ports)
├── playwright.config.ts               # Playwright E2E test config
├── package.json                       # Root package (playwright dependencies)
│
├── e2e/                               # Playwright end-to-end tests
│   ├── auth.spec.ts                   # Login/logout/redirect tests
│   ├── homework.spec.ts               # Teacher create → student submit flow
│   ├── marks.spec.ts                  # Exam create → marks entry → report card
│   └── school-boundary.spec.ts        # Cross-school data isolation tests
│
├── frontend/                          # React app (Vite)
│   ├── package.json
│   ├── vite.config.ts                 # Vite + PWA config, "@" alias → src/
│   ├── tailwind.config.*
│   ├── index.html
│   ├── .env                           # Local env vars (not committed)
│   ├── .env.example
│   │
│   └── src/
│       ├── main.tsx                   # React root render
│       ├── App.tsx                    # BrowserRouter, ThemeProvider, AuthProvider, all Routes, PWAUpdateBanner
│       │                              # All 4 dashboard routes use React.lazy() for code splitting
│       │
│       ├── contexts/
│       │   └── AuthContext.tsx        # useAuth() hook — user state, signOut, refreshUser
│       │                              # Cross-tab logout via BroadcastChannel.postMessage()
│       │                              # await authSignOut() — never fire-and-forget
│       │                              # handleSignOut clears localStorage keys matching ts_avatar_*, ts_clock_*, teachscript_avatar_* (PII/DPDP cleanup on logout)
│       │
│       ├── lib/
│       │   ├── auth.ts                # signIn, signOut, getCurrentUser, password reset
│       │   ├── userApi.ts             # Admin/Teacher API: classes, timetable, attendance, users, notifications
│       │   ├── studentApi.ts          # Student API: dashboard, quizzes, challenges, certificates, activity
│       │   ├── moduleApi.ts           # Module/lesson API: CRUD, file upload, item management
│       │   ├── marksApi.ts            # Marks API: exams CRUD, results, downloadReportCard, downloadMyReportCard
│       │   ├── homeworkApi.ts         # Homework API: CRUD, submissions, feedback (teacher + student)
│       │   ├── dpdpApi.ts             # DPDP Act API: requestDataDeletion, getDeletionRequests, reviewDeletionRequest
│       │   ├── parentApi.ts           # Parent portal API: child profile, progress, attendance, marks
│       │   └── utils.ts               # cn() Tailwind merge helper
│       │   All 7 API lib files (userApi, studentApi, moduleApi, marksApi, homeworkApi, dpdpApi, parentApi) share a
│       │   consistent internal apiFetch() with: 30-second AbortController timeout, X-Request-ID header (UUID per call),
│       │   and requestId echoed back in error returns so error UI can surface it to users.
│       │
│       ├── pages/
│       │   ├── StudentDashboard.tsx   # Student view switcher — delegates heavy sub-views to components/student/
│       │   ├── TeacherDashboard.tsx   # Teacher view switcher — delegates heavy sub-views to components/teacher/
│       │   ├── AdminDashboard.tsx     # Admin view switcher — delegates heavy sub-views to components/admin/
│       │   ├── ParentDashboard.tsx    # Parent portal (read-only child progress view)
│       │   ├── LoginPage.tsx          # Role-tabbed login (Student/Teacher/Admin/Parent) with DPDP privacy notice
│       │   ├── SignupPage.tsx         # School signup → pending approval flow; DPDP consent checkbox on final step
│       │   ├── ForgotPasswordPage.tsx # Email OTP password reset
│       │   ├── SetPasswordPage.tsx    # Create/reset password via token (also handles must_change_password flow)
│       │   │                          # zxcvbn strength meter: 4 color-coded bars + label; score < 2 blocked client-side and server-side
│       │   ├── HomePage.tsx           # Public landing page
│       │   ├── PricingPage.tsx        # Pricing plans page
│       │   ├── ForSchoolsPage.tsx     # B2B marketing for schools
│       │   ├── ForTeachersPage.tsx    # Teacher-focused benefits page
│       │   ├── LegalPage.tsx          # Terms/Privacy (routed via /legal/:type)
│       │   └── NotFoundPage.tsx       # 404 fallback
│       │
│       └── components/
│           ├── DashboardLayout.tsx    # Shared shell: sidebar (desktop), bottom nav (mobile), topbar; NAV_SECTIONS whitelist controls which items appear per role
│           ├── TimetableDisplayView.tsx  # Day×Period grid, editable timetable component
│           ├── ErrorBoundary.tsx      # React error boundary with fallback UI
│           ├── ProgressBar.tsx        # SVG animated progress ring
│           ├── PWAUpdateBanner.tsx    # Banner shown when new service worker is waiting — user controls when to update
│           ├── SkeletonCard.tsx       # Reusable skeleton loading card for list views
│           ├── Navbar.tsx             # Public site top navigation
│           ├── Footer.tsx             # Public site footer
│           ├── LoginModal.tsx         # Login modal overlay
│           ├── mode-toggle.tsx        # Light/dark theme button
│           ├── theme-provider.tsx     # Theme context (localStorage key: teachscript-theme)
│           ├── admin/                 # Admin dashboard panel components
│           │   ├── adminShared.tsx    # Shared types and helpers used across admin panels
│           │   ├── adminComponents.tsx # Shared UI components (tables, modals) used across admin panels
│           │   ├── AdminOverviewPanel.tsx  # School stats overview panel
│           │   ├── AdminClassesPanel.tsx   # Classes CRUD + timetable audit trail
│           │   ├── AdminTeachersPanel.tsx  # Teacher invite + assignments panel
│           │   └── AdminStudentsPanel.tsx  # Student add/import/assign panel
│           ├── teacher/               # Teacher dashboard panel components
│           │   ├── TeacherHomeworkPanel.tsx  # Homework creation, submission review, feedback
│           │   └── TeacherMarksPanel.tsx     # Exam creation, marks entry, report card download
│           ├── student/               # Student dashboard panel components
│           │   ├── StudentHomeworkPanel.tsx  # Homework list + answer submission
│           │   └── StudentMarksPanel.tsx     # My marks view + report card download
│           └── ui/                    # shadcn/ui primitives (button, input, dialog, etc.)
│
└── backend/                           # Express API server (TypeScript)
    ├── package.json
    ├── vitest.config.ts               # Vitest unit test config; coverage thresholds: lines 70, functions 70, branches 65
    ├── Dockerfile                     # Multi-stage Docker build (node:22-slim)
    ├── .env                           # Local env vars (not committed)
    ├── .env.example                   # Documented template for all env vars
    │
    └── src/
        ├── index.ts                   # Express app entry — rate limits, route mounting, Sentry, pino-http, graceful shutdown
        │                              # ALLOWED_ORIGINS: comma-separated env var for multi-domain CORS (falls back to FRONTEND_URL)
        │                              # X-Request-ID: echoes incoming header (or generates UUID) back in every response
        │                              # isPrivateIp(): CIDR-correct RFC-1918 check — gates /metrics endpoint (fixes 172.2x.x.x false-positive bug)
        │                              # warmOutstandingTemplate() called on startup to pre-warm certificate image cache
        │
        ├── middleware/
        │   └── auth.ts                # requireAuth (JWT cookie/header), requireAdmin, setTokenCookie
        │                              # Role + school_id cached for 30s (Redis if available, else in-process Map)
        │                              # JWT role claim intentionally ignored — DB role is always authoritative
        │                              # token_version check: if JWT tv claim < DB token_version, token rejected immediately (revocation on signout)
        │
        ├── lib/
        │   ├── mongodb.ts             # Mongoose connect (maxPoolSize: 50), drops stale attendance index on start
        │   ├── claude.ts              # Anthropic SDK client, getLessonAssistantResponse(question, context, language)
        │   ├── pdf.ts                 # getBrowser() singleton + renderHtmlToPdf() + generateCertificatePDF(CertificateData) → Buffer
        │   │                          # Circuit breaker + concurrency slots; getPuppeteerStatus() for health check
        │   │                          # assertReplaced() guard throws if a template placeholder is not substituted
        │   │                          # warmOutstandingTemplate() — pre-warms CDN image cache at startup; exported and called in index.ts on server start
        │   ├── gridfs.ts              # getGridFSBucket(bucketName) — shared helper for GridFS access
        │   │                          # BucketName = "lesson_files" | "uploads" | "pdf_reports"
        │   ├── redis.ts               # getRedis() — returns IORedis client or null if REDIS_URL not set
        │   │                          # getBullMQConnection() — returns BullMQ connection or null
        │   ├── logger.ts              # pino logger — JSON structured logs; LOG_LEVEL from env
        │   ├── retry.ts               # withRetry(fn, retries, delayMs) — exponential backoff helper
        │   ├── validateId.ts          # validateObjectId(id) — throws 400 if not a valid Mongoose ObjectId
        │   ├── email.ts               # sendEmail({to, subject, html}) — tries Resend (RESEND_API_KEY), falls back to Nodemailer/Gmail (EMAIL_USER + EMAIL_APP_PASSWORD), logs warning if neither set
        │   ├── sms.ts                 # sendSms(phone, otp, userName) — tries Fast2SMS (FAST2SMS_API_KEY), falls back to Twilio (TWILIO_ACCOUNT_SID+AUTH_TOKEN+FROM_NUMBER), logs info if neither configured; extracted from auth.ts to mirror email.ts pattern
        │   ├── planGate.ts            # requirePlan(...allowedPlans) Express middleware factory — returns 402 if school plan not in allowed list
        │   │                          # PLAN_ORDER: free(0) < starter(1) < standard(2) < premium(3); plan cached 30s (Redis + in-process fallback)
        │   ├── reportCardTemplate.ts  # buildReportCardHTML(ReportCardTemplateData) → HTML string; extracted from marks.ts so it can be unit-tested independently
        │   ├── supabase.ts            # Stub (Supabase removed; kept to avoid import crashes)
        │   └── validateEnv.ts         # Checks required env vars on startup — throws if JWT_SECRET is weak
        │
        ├── jobs/
        │   ├── queue.ts               # BullMQ queue helpers: getPptxQueue(), getPdfQueue(),
        │   │                          # queuePdfGeneration(PdfJobData) → jobId | null
        │   │                          # PdfJobData, PdfJobResult, PdfJobType interfaces
        │   ├── pptxWorker.ts          # BullMQ worker: PPTX → PDF conversion (LibreOffice), concurrency: 2
        │   │                          # SIGTERM/SIGINT handler kills active LibreOffice child processes cleanly
        │   │                          # startPptxWorker() / stopPptxWorker()
        │   ├── pdfWorker.ts           # BullMQ worker: HTML → PDF (Puppeteer), stores in GridFS pdf_reports bucket
        │   │                          # Issues 10-min FileToken; sync fallback if Redis not configured
        │   │                          # startPdfWorker() / stopPdfWorker() / generatePdfSync()
        │   ├── midnightClockOut.ts    # Scheduled job: auto-clocks-out all active sessions at midnight IST
        │   └── convertExistingPptx.ts # One-time background job on startup: converts legacy PPTX files to PDF
        │
        ├── models/
        │   ├── User.ts                # Users (all roles), school_id, class_id, points, preferred_language, must_change_password
        │   │                          # token_version field — incremented on signout; middleware rejects JWTs with tv < token_version
        │   ├── School.ts              # School record, board, subscription_plan (free|starter|standard|premium)
        │   │                          # storage_used_bytes (incremented on upload, decremented on delete, floored at 0)
        │   │                          # exports PLAN_STORAGE_QUOTAS (free=2GB, starter=10GB, standard=50GB, premium=200GB) and PLAN_ORDER
        │   ├── Class.ts               # Class with timetable[], timetable_versions[] (last 10), teachers[]
        │   ├── Module.ts              # Lesson module with items[] (files + links); items array capped at 200 via validator
        │   ├── Quiz.ts                # Quiz with questions[], is_active; questions validator (1–100 items)
        │   │                          # toJSON transform strips correct_index unconditionally (defense-in-depth for non-lean routes)
        │   ├── QuizAttempt.ts         # Student quiz attempt, answers[], score, percentage
        │   ├── CodeChallenge.ts       # Coding challenge with difficulty, language, deadline
        │   ├── ChallengeSubmission.ts # Student code submission (upserted per student+challenge)
        │   ├── Certificate.ts         # Issued certificate, unique(student_id, module_id)
        │   ├── ModuleProgress.ts      # Item-level progress, unique(student_id, module_id, item_id)
        │   ├── StudentActivity.ts     # Daily activity (items_viewed, logins, minutes_active capped at 600)
        │   ├── TeacherSession.ts      # Teacher login/logout sessions per day
        │   ├── PasswordReset.ts       # Token hash + expiry (TTL index auto-deletes)
        │   ├── PendingSignup.ts       # School signup applications (pending|approved|rejected)
        │   ├── FileToken.ts           # Short-lived tokens for GridFS file access (TTL index)
        │   ├── CertTemplate.ts        # Per-school certificate template (logo, colours, footer text)
        │   ├── ExamDefinition.ts      # Exam with type, date, subjects[], grade_scale[] (default A+→F)
        │   ├── ExamResult.ts          # Per-student per-subject marks (unique on exam_id+student_id+subject)
        │   ├── Homework.ts            # Homework assignment (subject, title, description max 2000 chars, due_date, is_active)
        │   ├── HomeworkSubmission.ts  # Student submission (upsert unique on homework_id+student_id)
        │   ├── DataDeletionRequest.ts # DPDP Act deletion request (status: pending|approved|rejected)
        │   ├── OTPSession.ts          # 2FA/SMS-login OTP sessions (bcrypt-hashed OTP, TTL 10 min)
        │   ├── Notification.ts        # Notification record (school/class/user scoped)
        │   ├── NotifRead.ts           # Per-user notification read status
        │   ├── AuditLog.ts            # DPDP compliance audit log — school_id, actor_id, action, resource_type, before/after, IP, timestamp
        │   │                          # Indices: {school_id, timestamp:-1}, {actor_id, timestamp:-1}; TTL 2 years (auto-delete for data minimisation)
        │   └── Attendance.ts          # Attendance record per class/date/period; period field validated min:1 max:8
        │
        ├── services/
        │   └── reportCard.ts          # fetchReportCardData() — single-student data-fetching; fetchReportCardDataBatch() — batch
        │                              # Used by both teacher and student report-card routes to avoid duplication
        │                              # Batch path reduces N×5 DB round-trips to ~5 using $in queries for ExamResult + Attendance
        │
        ├── scripts/
        │   └── migrateFileMetadata.ts # One-time idempotent migration: populates metadata.school_id on GridFS files from Module docs
        │                              # Run: npx tsx --env-file=.env src/scripts/migrateFileMetadata.ts
        │
        ├── tests/                     # Vitest unit tests (15 files, ~111 tests total)
        │   ├── helpers.ts             # Test utilities (MongoMemoryReplSet, test factories); createClass() uses randomised section to avoid unique index collisions
        │   ├── auth.test.ts           # Password hashing, JWT validation, OTP atomicity, token_version revocation
        │   ├── attendance.test.ts     # Attendance formula, future-date rejection, IST timezone
        │   ├── marks.test.ts          # Grade calculation, bulk upsert school boundary
        │   ├── homework.test.ts       # Submission upsert, deadline enforcement, feedback ownership
        │   ├── school-boundary.test.ts # Cross-school data isolation
        │   ├── middleware.test.ts     # requireAuth, requireAdmin, role cache behaviour, token_version rejection
        │   ├── modules.test.ts        # GET modules (school boundary), POST module, DELETE module
        │   ├── quizzes.test.ts        # GET quizzes (no correct_index for students), submit, one-attempt, school boundary, concurrent race
        │   ├── certificates.test.ts   # Eligible modules, claim, duplicate claim, <70% rejection, data isolation
        │   ├── ai.test.ts             # Valid teacher request (starter plan), missing question (400), student forbidden (402/403), no auth (401), language forwarded
        │   ├── challenges.test.ts     # CRUD, school boundary, language from definition, concurrent submit
        │   ├── files.test.ts          # Token generation, atomic consumption race test, range header support
        │   ├── planGate.test.ts       # free plan → 402, starter/premium → 200, no-auth → 401
        │   ├── storageQuota.test.ts   # PLAN_STORAGE_QUOTAS constants, floor-at-zero decrement, increment, schema rejection
        │   └── auditLog.test.ts       # Create, query, school isolation, TTL field present
        │
        └── routes/
            ├── auth.ts                # signin, signout, me, forgot-password, reset-password, clock-in/out, verify-otp, send-sms-otp
            │                          # OTP via crypto.randomBytes (not Math.random); role-based JWT expiry (admin/teacher=8h, student/parent=1d)
            │                          # SMS OTP delivery wrapped in withRetry (3 attempts, 500ms base); Fast2SMS response status checked before withRetry decides to retry
            │                          # signout increments token_version → stale JWTs rejected immediately by middleware
            ├── signup.ts              # check-email, request, approve/:id, reject/:id
            ├── users.ts               # User management (admin): add/update/remove teachers & students
            ├── school.ts              # School info, classes CRUD, timetable save, notifications
            │                          # GET /api/school/audit-log — admin only, paginated, filterable by actor_id and action
            ├── teacher.ts             # Attendance, timetable, class-students, notifications, student-progress
            ├── student.ts             # Dashboard stats, activity ping/clockout, classmates, attendance
            ├── modules.ts             # Modules + items CRUD, GridFS file upload, magic-byte validation, PPTX→PDF queue
            │                          # Storage quota check before upload (413 if exceeded); $inc storage_used_bytes on success; atomic $max(0,$subtract) on delete
            ├── quizzes.ts             # Quiz CRUD, submit attempt, get results
            ├── challenges.ts          # Code challenge CRUD, submit (upsert), get submissions
            ├── marks.ts               # Exam CRUD, result entry (bulk upsert), buildReportCardHTML(), report card PDF via pdfWorker
            │                          # Data-fetch logic extracted to services/reportCard.ts; AuditLog written on every bulk marks upsert
            ├── homework.ts            # Homework CRUD, student submission (upsert), teacher feedback/marks
            │                          # Deadline enforced: students cannot submit after due_date; teacher ownership on feedback
            ├── dpdp.ts                # DPDP Act: create deletion request, list requests, approve/reject
            │                          # AuditLog written on every approve/reject decision
            ├── parent.ts              # Parent portal: read-only child progress, attendance, marks
            │                          # All endpoints verify child.school_id === parent.school_id (cross-school guard)
            ├── ai.ts                  # POST /lesson-assist → Claude response; requirePlan("starter","standard","premium") gate (free → 402)
            │                          # Redis sliding-window rate limit 30/min per user; LRU fallback when Redis unavailable
            ├── certificates.ts        # Certificate template, bulk generate, custom issue, revoke
            ├── studentCertificates.ts # Student: eligible modules, claim, download PDF
            ├── files.ts               # GridFS file streaming via TTL token; HTTP Range (206) support for video seeking
            │                          # School boundary mandatory (fail-closed): missing metadata.school_id → 403; token consumed atomically via findOneAndDelete
            ├── run.ts                 # Code execution via Piston API sandbox (PISTON_URL env var required)
            │                          # Returns 503 with friendly message if PISTON_URL not configured
            ├── reports.ts             # Activity PDF, compliance report (Puppeteer)
            ├── payments.ts            # Razorpay order create + webhook verify
            └── whatsapp.ts            # WhatsApp notification integration
```

---

## 5. MongoDB Models

### User
```
name, email (unique lowercase), phone, username (unique sparse),
gender, password_hash, role (student|teacher|admin|super_admin|parent),
school_id, class_id, is_active, preferred_language (english|hindi),
profile_photo_url, points, must_change_password, token_version (default 0), created_at
token_version is incremented on every signout — middleware rejects JWTs whose tv claim < DB value
Indices: {school_id, role}, {class_id}
```

### School
```
name, board, city, state, udise_code,
subscription_plan (free|starter|standard|premium),
storage_used_bytes (default 0, min 0 — incremented on upload, decremented on delete), created_at
Exports: PLAN_STORAGE_QUOTAS = { free: 2GB, starter: 10GB, standard: 50GB, premium: 200GB }
         PLAN_ORDER = { free: 0, starter: 1, standard: 2, premium: 3 }
```

### Class
```
school_id, grade (3-8), section, name (custom label),
subjects[], teachers[] [{teacher_id, subject}],
timetable[] [{day, period, subject, teacher_id, start_time, end_time}],
timetable_versions[] (last 10 snapshots for audit trail),
timetable_updated_at, timetable_updated_by
Unique index: {school_id, grade, section}
```

### Module
```
school_id, class_id, subject, title, order (auto-numbered), created_by,
items[] [{_id, order, type (file|link), label, gridfs_id, pdf_gridfs_id,
          file_name, file_type, file_size, link_url (validated: must start with http:// or https://),
          link_type (gdrive|youtube|other)}],
created_at, updated_at
items array capped at 200 via Mongoose validator (prevents BSON 16MB document limit)
Index: {school_id, class_id, subject, order}
```

### Quiz
```
school_id, class_id, created_by, title, is_active,
questions[] [{text, options[4], correct_index (0-3), explanation}],
created_at
questions array validator: 1–100 items
toJSON transform: strips correct_index unconditionally (defense-in-depth; routes using .lean() do their own strip)
Index: {school_id, class_id}
```

### QuizAttempt
```
quiz_id, student_id, school_id,
answers[] (selected option indices), score, total, percentage, submitted_at
Indices: {student_id, quiz_id} (unique — one attempt only), {school_id, quiz_id}, {student_id, submitted_at}
```

### CodeChallenge
```
school_id, class_id, created_by, title,
difficulty (Easy|Medium|Hard), language (javascript|python|html),
description, constraints, expected_output, deadline (Date|null),
is_active, created_at
Index: {school_id, class_id}
```

### ChallengeSubmission
```
challenge_id, student_id, school_id, code, language, submitted_at
Unique upsert on {challenge_id, student_id} — re-submit overwrites
Index: {student_id, challenge_id}
```

### Certificate
```
student_id, school_id, class_id, module_id (unique per student),
module_title, subject, class_label, student_name, type (module|custom), issued_at
Unique index: {student_id, module_id}
Indices: {school_id}, {student_id}
```

### ModuleProgress
```
student_id, module_id, item_id, viewed_at
Unique index: {student_id, module_id, item_id}
Indices: {student_id}, {module_id, student_id}  ← added for teacher student-progress panel query
```

### StudentActivity
```
student_id, school_id, date (YYYY-MM-DD),
items_viewed, logins, minutes_active (capped at 600/day)
Unique index: {student_id, date}
Index: {school_id, date}
```

### TeacherSession
```
teacher_id, school_id, date (YYYY-MM-DD IST), login_at, logout_at, duration_minutes
Indices: {teacher_id, date}, {school_id, date}
```

### PasswordReset
```
user_id, token_hash, expires_at, used
TTL index on expires_at — auto-deletes expired tokens
Single-use: checked with used: false, set to used: true on consumption
```

### PendingSignup
```
school_name, board, city, state, total_students,
admin_name, admin_email, admin_phone,
first_class_*, first_teacher_*,
status (pending|approved|rejected), reviewed_at, created_at
```

### FileToken
```
token (unique), userId, gridfsId, expiresAt
TTL index — auto-expires short-lived file access tokens (10 min default for PDF downloads)
```

### CertTemplate
```
school_id (unique per school), school_name,
logo_gridfs_id (nullable — school logo stored in GridFS),
description (template string with {module}/{subject}/{class}/{student}/{school} placeholders),
footer_left, footer_right, accent_color (hex, default #534AB7), updated_at
Unique index: school_id
```

### ExamDefinition
```
school_id, class_id, created_by, title,
exam_type (unit_test|mid_term|final|practical|other),
date,
subjects[] [{name, max_marks}],
grade_scale[] [{min, grade, label}] — default: A+(90), A(80), B+(70), B(60), C(50), D(40), F(0)
created_at
Index: {school_id, class_id, created_at:-1}
```

### ExamResult
```
exam_id, student_id, school_id, class_id, subject,
marks_obtained (number|null), is_absent (boolean)
Unique index: {exam_id, student_id, subject} — upserted on entry
Indices: {student_id, school_id}, {exam_id, school_id}
```

### Homework
```
school_id, class_id, created_by, subject, title,
description (max 2000 chars), due_date, is_active, created_at
Indices: {school_id, class_id, due_date:-1}, {created_by}
```

### HomeworkSubmission
```
homework_id, student_id, school_id,
answer_text (max 5000 chars), feedback (max 1000 chars), marks (number|null),
submitted_at, updated_at
Unique index: {homework_id, student_id} — upserted on re-submit
Indices: {student_id}, {school_id}
```

### DataDeletionRequest
```
user_id, user_name, user_email, user_role, school_id,
reason, status (pending|approved|rejected),
reviewed_at (optional), reviewed_by (optional),
created_at
Indices: {school_id, status}, {user_id}
```

### OTPSession
```
session_token_hash (unique), otp_hash (bcrypt),
user_id, email (nullable), phone (nullable),
channel (email|sms), role, school_id,
expires_at, used
TTL index on expires_at — auto-deletes after expiry (10 min window)
```

### Notification
```
school_id, class_id (nullable — null = school-wide), created_by,
type (announcement|reminder|achievement|alert|event),
title, message, scheduled_at (nullable), created_at
Indices: {school_id, created_at:-1}, {class_id}
```

### NotifRead
```
notification_id, user_id, read_at
Unique index: {notification_id, user_id}
Index: {user_id}
```

### Attendance
```
school_id, class_id, date (YYYY-MM-DD), period (min: 1, max: 8),
records[] [{student_id, status (present|absent|late)}],
marked_by, created_at
Unique index: {class_id, date, period}
Indices: {school_id, date}, {class_id, date}
```

### AuditLog
```
school_id, actor_id, actor_role, action (e.g. "marks.bulk_upsert", "dpdp.deletion_approved"),
resource_type, resource_id, before (object|null), after (object|null), ip, timestamp
Indices: {school_id, timestamp:-1}, {actor_id, timestamp:-1}
TTL index on timestamp — auto-deletes after 2 years (DPDP Act data minimisation)
Written by: routes/marks.ts (bulk upsert), routes/dpdp.ts (approve/reject)
Queried by: GET /api/school/audit-log (admin only, paginated, supports actor_id + action filters)
```

---

## 6. API Routes

All routes under `/api/*`. Auth = requires `ts_token` cookie or `Authorization: Bearer` header.

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signin` | No | Login with email/phone/username + password → sets ts_token cookie |
| POST | `/signout` | Yes | Clears ts_token cookie |
| GET | `/me` | Yes | Returns current user profile |
| POST | `/forgot-password` | No | Sends password reset email (rate limited: 5/15 min) |
| POST | `/reset-password` | No | Reset password via token (single-use) |
| POST | `/clock-in` | Yes | Record session start (daily active tracking) |
| POST | `/clock-out` | Yes | Record session end, persist duration to TeacherSession / StudentActivity |
| GET | `/clock-status` | Yes | Returns whether the user is currently clocked in |
| POST | `/send-sms-otp` | No | Send SMS OTP for passwordless login (rate limited: 5/15 min) |
| POST | `/verify-sms-otp` | No | Verify SMS OTP → issues JWT (rate limited: 10/15 min) |
| POST | `/verify-otp` | No | Verify 2FA email OTP → issues JWT |

### Signup — `/api/signup`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check-email` | No | Check if admin email is available |
| POST | `/request` | No | Submit new school signup application (rate limited) |
| GET | `/approve/:id` | No (HMAC token) | Approve school, create Admin user, send credentials |
| GET | `/reject/:id` | No (HMAC token) | Reject application, notify admin |

### School — `/api/school`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes (admin) | School info + teacher/student/class counts |
| PATCH | `/` | Yes (admin) | Update school info (name, board, city, state, UDISE code) |
| GET | `/classes` | Yes | All classes with timetable + student counts |
| POST | `/classes` | Yes (admin) | Create class (grade 3-8, section) |
| PATCH | `/classes/:id` | Yes (admin) | Rename class / update subjects |
| PATCH | `/classes/:id/teacher` | Yes (admin) | Assign/reassign teacher for a class |
| DELETE | `/classes/:id` | Yes (admin) | Soft-delete class + cascade delete modules/quizzes/challenges |
| PUT | `/classes/:id/timetable` | Yes | Save timetable slots (conflict detection enforced) |
| GET | `/teachers` | Yes | List all teachers in school |
| GET | `/students` | Yes | List all students in school |
| GET | `/my-student-info` | Yes (student) | Student's own profile info |
| GET | `/my-class` | Yes (student) | Student's class details and classmates |
| GET | `/teacher-sessions` | Yes (admin/teacher) | Teacher login/logout session history |
| GET | `/audit-log` | Yes (admin) | Paginated audit log; supports `?actor_id=` and `?action=` filters |
| POST | `/notifications` | Yes (admin) | Create school-wide notification |
| GET | `/notifications` | Yes | Get notifications for user's school |
| DELETE | `/notifications/:id` | Yes (admin) | Delete a notification |

### Users — `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/invite-teacher` | Yes (admin) | Invite teacher by email → sends credentials |
| POST | `/add-student` | Yes | Add single student to a class |
| POST | `/bulk-students` | Yes | Bulk add students (max 500 per batch) |
| POST | `/bulk-teachers` | Yes (admin) | Bulk invite teachers from array |
| PATCH | `/profile` | Yes | Update own profile (name, phone, profile photo, language) |
| PATCH | `/teacher/:id` | Yes (admin) | Update teacher details (name, is_active) |
| PUT | `/teacher/:id/assignments` | Yes (admin) | Set teacher class/subject assignments |
| PATCH | `/student/:id` | Yes | Update student (name, class) |
| PATCH | `/bulk-gender` | Yes (admin) | Bulk set gender on a list of users |
| PATCH | `/bulk-assign-class` | Yes (admin) | Bulk assign students to a class |
| PATCH | `/bulk-transfer` | Yes (admin) | Bulk transfer students to another class |
| DELETE | `/bulk-delete` | Yes (admin) | Bulk soft-delete users (is_active = false) |
| DELETE | `/:id` | Yes | Soft-delete user (is_active = false) |

### Teacher — `/api/teacher`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/attendance` | Yes (teacher) | Save attendance {class_id, date, period, records[]}; rejects future dates |
| GET | `/attendance` | Yes | Get attendance for class+date+period |
| GET | `/attendance-stats` | Yes | Per-student + class-aggregate attendance % across 4 ranges |
| GET | `/attendance-range` | Yes | Per-student + class-aggregate stats for custom date range |
| GET | `/student-attendance` | Yes (student) | Student fetches own full attendance history |
| GET | `/class-students` | Yes (teacher) | Fetch students for any class in teacher's school |
| GET | `/my-class` | Yes (teacher) | Teacher's primary class details and students |
| GET | `/timetable` | Yes | Timetable for a class (by class_id query param) |
| PUT | `/timetable/:class_id` | Yes (teacher) | Save timetable slots (conflict detection enforced) |
| GET | `/my-classes` | Yes (teacher) | Classes this teacher teaches |
| GET | `/student-timetable` | Yes (student) | Student's class timetable |
| GET | `/notifications` | Yes | Notifications for current user |
| PATCH | `/notifications/read` | Yes | Mark specific notification as read |
| PATCH | `/notifications/read-all` | Yes | Mark all notifications as read |
| POST | `/notifications` | Yes (teacher) | Create/broadcast a notification to a class |
| GET | `/notifications/sent` | Yes (teacher) | List notifications sent by this teacher |
| DELETE | `/notifications/:id` | Yes (teacher) | Delete a notification |
| GET | `/student-progress` | Yes (teacher) | Per-student lesson progress across modules |
| GET | `/activity/week` | Yes (teacher) | Weekly activity data for a class |

### Student — `/api/student`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | Yes (student) | Aggregated stats, continue-learning, upcoming events |
| GET | `/quests` | Yes (student) | Active quest checklist |
| GET | `/classmates` | Yes (student) | Top 5 classmates by points |
| POST | `/activity/ping` | Yes (student) | Record login or item_viewed activity |
| POST | `/activity/clockout` | Yes (student) | Add session minutes to daily total |
| GET | `/teachers` | Yes (student) | List teachers in student's class |
| GET | `/attendance` | Yes (student) | Student's attendance records (date+period level) |
| GET | `/attendance/range` | Yes (student) | Student's attendance for a custom date range |

### Modules — `/api/modules`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/counts` | Yes | Module count per subject for a class |
| GET | `/` | Yes | Modules for class+subject (includes viewedItemIds for students) |
| POST | `/` | Yes (teacher) | Create module |
| PATCH | `/:id` | Yes (teacher) | Rename module |
| DELETE | `/:id` | Yes (teacher) | Delete module + GridFS files + progress |
| PUT | `/reorder` | Yes (teacher) | Reorder modules |
| POST | `/:id/items` | Yes (teacher) | Upload files (disk-based streaming, 200MB max, 10 files; magic-byte validated) or add link |
| PATCH | `/:id/items/:itemId` | Yes (teacher) | Rename item |
| DELETE | `/:id/items/:itemId` | Yes (teacher) | Delete item + GridFS chunks |
| PUT | `/:id/items/reorder` | Yes (teacher) | Reorder items |
| POST | `/:id/items/:itemId/viewed` | Yes (student) | Mark item as viewed (triggers progress update + points) |

### Quizzes — `/api/quizzes`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Students: class quizzes (no correct_index); Teachers: own quizzes |
| POST | `/` | Yes (teacher) | Create quiz with questions |
| PATCH | `/:id` | Yes (teacher) | Edit quiz (title, questions, is_active) |
| DELETE | `/:id` | Yes (teacher) | Delete quiz |
| POST | `/:id/submit` | Yes (student) | Submit answers → score (race-condition safe via upsert) |
| GET | `/:id/attempts` | Yes | Student's attempts for a quiz |
| GET | `/:id/results` | Yes (teacher) | All student results for a quiz |

### Challenges — `/api/challenges`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Students: class challenges with submitted flag; Teachers: own challenges |
| POST | `/` | Yes (teacher) | Create challenge |
| DELETE | `/:id` | Yes (teacher) | Delete challenge |
| POST | `/:id/submit` | Yes (student) | Submit code (upserts — re-submit overwrites before deadline) |
| GET | `/:id/submissions` | Yes (teacher) | All student submissions for a challenge |
| GET | `/my-submissions` | Yes (student) | Student's own submissions |

### Marks — `/api/marks`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes (teacher/admin) | All exams for a class (by class_id param) |
| POST | `/` | Yes (teacher) | Create exam definition (title, type, date, subjects, grade_scale) |
| DELETE | `/:id` | Yes (teacher) | Delete exam + all results |
| GET | `/:id/results` | Yes (teacher/admin) | All students' results for an exam |
| POST | `/:id/results` | Yes (teacher) | Bulk upsert marks — validates all student IDs belong to school before writing |
| GET | `/my-results` | Yes (student) | Student's own marks across all exams |
| GET | `/report-card/:studentId` | Yes (teacher/admin) | Generate PDF report card (via pdfWorker queue or sync fallback) |
| GET | `/my-report-card` | Yes (student) | Generate and download own PDF report card |

### Homework — `/api/homework`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Teachers: homework for a class (class_id param); Students: own class homework with submission status |
| POST | `/` | Yes (teacher) | Create homework (subject, title, description, due_date, class_id) |
| PATCH | `/:id` | Yes (teacher) | Edit homework (title, description, due_date, is_active) — only creator |
| DELETE | `/:id` | Yes (teacher) | Delete homework + all submissions — only creator |
| POST | `/:id/submit` | Yes (student) | Submit/update answer (upserts — re-submit overwrites) |
| GET | `/:id/submissions` | Yes (teacher/admin) | All student submissions for a homework with student names |
| PATCH | `/submissions/:subId` | Yes (teacher) | Give feedback and/or marks to a submission |
| GET | `/my-submissions` | Yes (student) | Student's own submissions enriched with homework info |

### DPDP — `/api/dpdp`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/deletion-request` | Yes | Submit data deletion request (DPDP Act 2023); 409 if pending request exists |
| GET | `/deletion-requests` | Yes (admin) | List all deletion requests for school |
| PATCH | `/deletion-requests/:id` | Yes (admin) | Approve (soft-deactivates user) or reject request |

### Parent — `/api/parent`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/child` | Yes (parent) | Linked child's profile, class, teacher info |
| GET | `/child/attendance` | Yes (parent) | Child's attendance records |
| GET | `/child/progress` | Yes (parent) | Child's lesson progress across all modules |
| GET | `/child/marks` | Yes (parent) | Child's exam results |
| GET | `/child/certificates` | Yes (parent) | Child's issued certificates |

### AI — `/api/ai`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/lesson-assist` | Yes (teacher, starter+ plan) | {question, context?, language?} → Claude response; 402 for free-plan schools; 30 req/min per user via Redis sliding window (LRU fallback) |

### Certificates — `/api/certificates`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes (admin) | All issued certificates for school |
| GET | `/template` | Yes | Get school's certificate template (auto-creates default if none) |
| POST | `/template` | Yes (teacher/admin) | Save certificate template settings |
| POST | `/template/logo` | Yes (teacher/admin) | Upload school logo (max 5MB, stored in GridFS) |
| DELETE | `/template/logo` | Yes (teacher/admin) | Remove school logo |
| GET | `/download/:id` | Yes | Download/view certificate PDF (?inline=1 to open in browser) |
| GET | `/class/:classId/module/:moduleId` | Yes (teacher/admin) | List certs for a specific class + module |
| GET | `/class/:classId` | Yes (teacher/admin) | All certs for a class grouped by module |
| POST | `/bulk-generate` | Yes (teacher/admin) | Download ZIP of all certs for class+module |
| POST | `/preview` | Yes (teacher/admin) | Preview PDF using current template + sample data |
| POST | `/custom-issue` | Yes (teacher/admin) | Issue custom certificates to one or more students |
| DELETE | `/:id` | Yes (teacher/admin) | Revoke a custom certificate |

### Student Certificates — `/api/student-certificates`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/eligible` | Yes (student) | Modules ≥70% complete, not yet claimed |
| POST | `/claim` | Yes (student) | Claim certificate for module (race-condition safe) |
| GET | `/my` | Yes (student) | All student's certificates |
| GET | `/mine` | Yes (student) | Alias for /my |
| GET | `/download/:id` | Yes (student) | Download certificate as PDF |

### Files — `/api/files`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/token` | Yes | Issue short-lived TTL-protected file access token |
| GET | `/:token` | No (token in path) | Stream GridFS file using token |

### Run — `/api/run`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Yes | Execute code via Piston API sandbox (python/javascript/html); returns {output, stderr}; 503 if PISTON_URL not configured; rate limited 20/min |

### Reports — `/api/reports`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/activity-pdf` | Yes (teacher) | Generate Puppeteer PDF of lesson activity report |
| GET | `/compliance` | Yes (admin/teacher) | Generate board compliance report PDF |

### Payments — `/api/payments`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/order` | Yes | Create Razorpay order |
| POST | `/webhook` | No (HMAC signature) | Razorpay payment webhook — raw body required before JSON parser |

### WhatsApp — `/api/whatsapp`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/send` | Yes (teacher/admin) | Send WhatsApp notification to a user or class |

### Health — (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Simple liveness check — returns `{ status: "ok" }` |
| GET | `/health/detailed` | MongoDB state, Redis ping, Puppeteer status, BullMQ queue depths, memory usage |

---

## 7. Frontend Architecture

### Routing (`frontend/src/App.tsx`)
```
/                       → HomePage
/pricing                → PricingPage
/signup                 → SignupPage
/login                  → LoginPage
/for-schools            → ForSchoolsPage
/for-teachers           → ForTeachersPage
/forgot-password        → ForgotPasswordPage
/set-password           → SetPasswordPage
/legal/:type            → LegalPage
/student/dashboard      → RequireAuth(role="student") → lazy(StudentDashboard)
/teacher/dashboard      → RequireAuth(role="teacher") → lazy(TeacherDashboard)
/admin/dashboard        → RequireAuth(role="admin")   → lazy(AdminDashboard)
/parent/dashboard       → RequireAuth(role="parent")  → lazy(ParentDashboard)
/*                      → NotFoundPage
```

`RequireAuth` reads `useAuth()`. If not authenticated → redirects to `/login` (passes `?redirect=` param so user returns to their destination after login). If `must_change_password === true` → redirects to `/set-password` before anything else.

All four dashboard imports use `React.lazy()` — each dashboard bundle is only loaded when the user navigates to that role's route.

### Auth Flow (`frontend/src/contexts/AuthContext.tsx`)
1. On mount, calls `getCurrentUser()` → `GET /api/auth/me`
2. If 401 → user is null (not logged in)
3. `signIn()` → calls `frontend/src/lib/auth.ts` → sets `ts_token` httpOnly cookie → calls `setUserFromLogin(user)` to skip GET /me refetch
4. `signOut()` → `await authSignOut()` → `POST /api/auth/signout` (increments token_version on server) → clears state, redirects to `/login`; clears localStorage keys matching `ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*`
5. Cross-tab logout via two mechanisms:
   - `BroadcastChannel.postMessage("signout")` — works in Chrome/Firefox
   - `localStorage.setItem("ts_logout_signal", timestamp)` then immediate remove — triggers `storage` event in Safari <15.4 and iOS WKWebView
6. Auth state is NEVER stored in localStorage — only in the `ts_token` httpOnly cookie

### DashboardLayout — NAV_SECTIONS Whitelist
`DashboardLayout.tsx` has a `NAV_SECTIONS` object per role. A nav item in a dashboard's `NAV_ITEMS` array will only appear in the sidebar if its label ALSO exists in `NAV_SECTIONS` for that role. Always update BOTH when adding a new nav item.

Current sections:
```
student:  Overview (Dashboard, Lessons, Timetable)
          Activities (Quizzes, Homework, Certificates, My attendance, My Marks, Live Code)
          School (Teachers)
          Account (Settings)

teacher:  Overview (Dashboard, Lessons, Timetable, Live Code)
          Management (Attendance, Students, Quizzes, Homework, Marks, Certificates)
          Communicate (AI assistant, Notifications)
          Account (Settings)

admin:    School (Overview, Classes, Timetable)
          People (Teachers, Students)
          Manage (Marks, Certificates, Reports, Data Requests)
          Communicate (Notifications)
          Account (Settings)
```

### View Switching (Dashboard pages)
All three dashboards are single-component files with a `view` state. Navigation items call `setView("view-name")` via `VIEW_MAP`. Heavy sub-views are extracted into panel components under `components/admin/`, `components/teacher/`, `components/student/`.
```tsx
const VIEW_MAP = { "Dashboard": "dashboard", "Homework": "homework", ... }
// Nav click → setView(VIEW_MAP[item.label])
// Render: {view === "homework" && <TeacherHomeworkPanel ... />}
// Heavy panels are named exports from components/teacher/TeacherHomeworkPanel.tsx etc.
```

### PWA Update Flow
`PWAUpdateBanner.tsx` is mounted in `App.tsx`. When Vite's service worker detects a new build, the banner appears — the user clicks "Update now" to reload. Updates never happen automatically mid-session.

### API Call Pattern
```ts
async function getHomework(classId: string) {
  return apiFetch<{ homework: HomeworkItem[] }>(`/api/homework?class_id=${classId}`)
}
// apiFetch (all 7 lib files): adds VITE_BACKEND_URL, sends credentials: "include" for cookie auth
// Includes: 30-second AbortController timeout, X-Request-ID (UUID per call) sent as header
// Returns { error: string, requestId?: string } on failure, typed data on success
// Callers: always check if ("error" in res) before using data
```

### State Management
- No Redux or Zustand — all state is local `useState` + `useEffect` in each page component
- Lazy loading: data fetched only when the relevant view is first opened
- Pattern:
  ```ts
  const [data, setData] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (view !== "target" || loaded) return
    fetchData().then(res => { if (!("error" in res)) setData(res.data); setLoaded(true) })
  }, [view, loaded])
  ```

### Theme
- ThemeProvider wraps everything in App.tsx
- Key: `teachscript-theme`, values: `light` | `dark`
- CSS variables: `--foreground`, `--background`, `--muted`, `--border`, etc.
- Brand colors: primary purple `#534AB7`, blue `#378ADD`, green `#639922`

---

## 8. Security Architecture

### Rate Limits (per IP unless noted)
| Endpoint | Limit |
|----------|-------|
| All `/api/*` | 300 req/min |
| `/api/auth/signin` | 5 attempts / 15 min (brute-force protection) |
| `/api/auth/forgot-password` | 5 / 15 min |
| `/api/auth/reset-password` | 5 / 15 min |
| `/api/auth/verify-otp` | 10 / 15 min |
| `/api/auth/send-sms-otp` | 5 / 15 min |
| `/api/auth/verify-sms-otp` | 10 / 15 min |
| `/api/signup/request` | 5 / 15 min |
| `/api/ai/*` | 30 req/min **per user** (LRU keyed on userId, not IP) |
| `/api/certificates/*` | 20 req/min |
| `/api/reports/*` | 20 req/min |
| `/api/run` | 20 req/min |
| `/api/users/*` | 60 req/min |

### Security Headers (Helmet + nginx)
- CSP (API backend via Helmet): `defaultSrc 'self'`, `scriptSrc 'self'`, `objectSrc 'none'`, `frameAncestors 'none'`
- CSP (nginx — frontend): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.teachscript.in; media-src 'self' blob:; frame-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';`
- HSTS: max-age 31536000, includeSubDomains
- Referrer-Policy: strict-origin-when-cross-origin
- Frameguard: SAMEORIGIN
- X-Request-ID: echoed back in every API response — frontend can surface to users in error states

### Auth & Data Isolation
- JWT stored in `ts_token` httpOnly cookie — never localStorage
- JWT expiry is role-based: **8 hours** for admin/teacher, **1 day** for student/parent
- JWT role is re-read from DB every **30 seconds** (cached in `middleware/auth.ts` via Redis if available, otherwise in-process Map) — role claim in JWT payload is intentionally ignored to prevent role escalation
- **Token revocation**: `token_version` field on User — signout increments it; middleware rejects any JWT where `tv` claim < DB `token_version`; stale tokens invalid immediately (no 8-hour window for abuse)
- Every route verifies `user.school_id` matches the resource's `school_id` — cross-school data access is impossible
- **Subscription enforcement**: `requirePlan()` middleware from `lib/planGate.ts` gates features by plan tier; returns 402 with `{error, current_plan, required_plans}` — AI assistant requires starter+ plan
- Passwords: bcrypt with **12 rounds**; input capped at 128 chars (bcrypt DoS protection); zxcvbn score < 2 rejected on set/change/reset routes
- `password_hash` is never returned by any route — always excluded from `.select()`
- OTP generation uses `crypto.randomBytes(3)` — cryptographically secure, not `Math.random()`
- OTP TOCTOU fixed: mark-used + increment applied atomically via single MongoDB aggregation pipeline update (no separate read-then-write)
- Attendance cannot be marked for future dates (IST timezone enforced on backend; `TZ=Asia/Kolkata` in docker-compose)
- Student points use `$max` operator — cannot decrease once set
- File uploads validated by magic bytes (`file-type` package) — not just Content-Type header
- GridFS school boundary fail-closed: `metadata.school_id` must match user's school; missing metadata → 403 (not skipped)
- File token consumption atomic via `findOneAndDelete` — no race condition on concurrent download clicks
- Bulk marks upsert validates all student IDs belong to the school before writing anything
- Rate limiters see real client IP via `app.set("trust proxy", 1)` (nginx X-Forwarded-For)
- CORS: `ALLOWED_ORIGINS` env var allows multi-domain deployments; falls back to `FRONTEND_URL` for single-origin
- localStorage cleared on signout (`ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*`) — no PII persists after logout
- Cross-tab logout: BroadcastChannel + localStorage storage event (Safari <15.4 / iOS WKWebView fallback)
- Open redirect prevented: login `?redirect=` param validated with URL origin-pinning (`new URL(param, window.location.href).origin === window.location.origin`)
- /metrics endpoint restricted to private IPs via CIDR-correct `isPrivateIp()` — fixes prior bug where `172.2xx.x.x` (public) was incorrectly allowed
- **SAST**: eslint-plugin-security runs in CI on every push — catches unsafe-regex, pseudoRandomBytes, buffer misuse, prototype pollution

### DPDP Act 2023 (India Data Privacy)
- Consent checkbox on school signup (final step)
- Privacy notice shown on every login page ("By signing in you accept our Privacy Policy — DPDP Act 2023")
- Users can request data deletion from Settings — creates `DataDeletionRequest` record
- Admin reviews requests: approve soft-deactivates the user (`is_active: false`), reject closes it
- All requests scoped to school — admin can only see their school's requests
- **AuditLog**: every approve/reject decision and every bulk marks entry is written to `AuditLog` — 2-year retention (auto-deleted by TTL index for data minimisation); queryable via `GET /api/school/audit-log`

---

## 9. Coding Conventions

### Always Do
- **Check API errors**: `if ("error" in res) { showError(res.error); return }` before using data
- **School boundary**: every backend route must verify `user.school_id === resource.school_id`
- **Select fields explicitly**: `.select("field1 field2")` — never return full user docs
- **Use `lean()`**: always on Mongoose queries for plain objects (faster, no Mongoose overhead)
- **Role check first**: validate role at the top of every route handler before any DB work
- **Upsert re-submissions**: use `findOneAndUpdate(..., { upsert: true })` — never `create()` for homework/challenge/quiz submissions
- **Attendance rate formula**: `(present + late × 0.5) / total × 100`
- **Validate ObjectIds**: use `validateObjectId(id)` from `lib/validateId.ts` before any ObjectId conversion — invalid IDs throw a clean 400, not a 500
- **Validate student ownership on bulk writes**: when bulk-upserting marks/results for a list of student IDs, verify ALL student IDs belong to the correct school before writing anything
- **Use pino logger**: `import { logger } from "../lib/logger.js"` — never use `console.log/error/warn` in backend code
- **Use GridFS helper**: `import { getGridFSBucket } from "../lib/gridfs.js"` — never redefine `getGridFSBucket()` locally
- **Use withRetry for flaky ops**: wrap external calls (email, SMS) with `withRetry()` from `lib/retry.ts`
- **PDF generation**: use `sendReportCardPdf()` helper in marks.ts (queue path + sync fallback) — never call `renderHtmlToPdf()` directly from routes
- **PDF template substitution**: call `assertReplaced(html, placeholder, context)` after every `.replace()` on a template string — throws immediately if a placeholder was not found, preventing silent empty fields
- **Code execution**: all code runs via the Piston API (`PISTON_URL`), never via `spawn("python3")` or any direct process execution
- **shadcn Button**: use `<Button>` from `@/components/ui/button` — not raw `<button>` for action buttons
- **Tailwind classes only**: no inline `style` for static colors; use inline style only for dynamic hex values
- **TypeScript everywhere**: no `.js` files in `src/` — all `.ts` or `.tsx`
- **`credentials: "include"`**: every `fetch()` call must include this for cookie auth
- **Soft-delete only**: never hard-delete users — always `is_active: false`
- **Cascade on class delete**: deleting a class must also delete its modules, quizzes, challenges, and related progress
- **Models in `models/` only**: all Mongoose schemas must live in `backend/src/models/` — never define schemas inline in route files
- **Await sign-out**: always `await authSignOut()` — fire-and-forget sign-out leaves valid cookies on the server
- **Cross-tab logout**: `BroadcastChannel.postMessage("signout")` must be called when signing out
- **Clear localStorage on signout**: remove all `ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*` keys — PII must not persist after logout
- **SMS delivery via lib/sms.ts**: call `sendSms(phone, otp, userName)` — never inline SMS delivery in route files
- **Password strength**: enforce `zxcvbn(password).score >= 2` on all set/change/reset flows (both client and server)
- **AbortController on all fetches**: all internal `apiFetch()` helpers have a 30-second abort timer — never omit it
- **X-Request-ID on all fetches**: send `X-Request-ID` header (UUID per call) so backend logs correlate with frontend error displays
- **Validate redirect URLs**: use origin-pinning (`new URL(param, window.location.href).origin === window.location.origin`) before following any redirect param — never blindly follow user-supplied URLs
- **Use ALLOWED_ORIGINS env var**: when adding a new allowed CORS origin, add it to `ALLOWED_ORIGINS` in `.env` — never hardcode in code
- **Plan gate on paid features**: wrap premium routes with `requirePlan("starter","standard","premium")` from `lib/planGate.ts` — never inline subscription checks in route handlers
- **Write AuditLog on sensitive mutations**: bulk marks entry and DPDP decisions must write an AuditLog record; failure to write must log but NOT fail the response
- **Use Mongoose aggregation pipeline updates with `{ updatePipeline: true }`**: when passing an array as the update argument to `updateOne()`, always include the option — omitting it throws `MongooseError: Cannot pass an array to query updates`
- **Batch report card queries**: use `fetchReportCardDataBatch()` from `services/reportCard.ts` for bulk PDF generation — never call `fetchReportCardData()` in a loop
- **Storage quota before upload**: call `checkStorageQuota(schoolId, additionalBytes)` before writing to GridFS; return 413 if exceeded; decrement on delete using `$max: [0, $subtract]` pipeline
- **Increment token_version on sensitive auth events**: signout already does this; any future password-change or role-change route should also increment it

### Never Do
- **Never return `password_hash`** from any route
- **Never skip school boundary checks** — school A data must never be readable by school B
- **Never use `ChallengeSubmission.create()`** for re-submissions — use `findOneAndUpdate` with upsert
- **Never store auth state in localStorage** — use the `ts_token` httpOnly cookie
- **Never mark attendance for future dates**
- **Never decrease student points** — use `$max` operator
- **Never launch a new Puppeteer browser per request** — use `getBrowser()` singleton from `lib/pdf.ts`
- **Never use `any` in TypeScript** — use `unknown` + narrow, or define proper interfaces
- **Never cast with `as never` or `as unknown as`** — define a proper TypeScript interface for the lean result shape instead
- **Never put large logic in JSX** — extract computed values above the `return` statement
- **Never add nav items without updating both** the dashboard's `NAV_ITEMS` AND `DashboardLayout.tsx`'s `NAV_SECTIONS`
- **Never duplicate large HTML template strings** — extract shared builder functions (`buildReportCardHTML` in marks.ts is the canonical shared helper)
- **Never trust `Content-Type` header alone for file uploads** — always validate actual file bytes with `file-type` magic-byte checking
- **Never call `console.log/error/warn` in backend** — use the pino `logger` from `lib/logger.ts`
- **Never redefine `getGridFSBucket()`** in individual route files — import from `lib/gridfs.ts`
- **Never trust JWT role claim** — middleware re-reads role from DB (cached 30s) and the JWT claim is ignored
- **Never use `ip.startsWith("172.2")` for private IP detection** — use `isPrivateIp()` from index.ts which correctly covers 172.16.0.0/12 only
- **Never leave localStorage PII after logout** — always call the localStorage cleanup in `AuthContext.handleSignOut`
- **Never inline SMS delivery in route files** — use `sendSms()` from `lib/sms.ts`
- **Never follow redirect params blindly** — always validate origin before redirecting to a user-supplied URL
- **Never skip plan gate on premium features** — free-plan schools must get 402, not a degraded experience or silent success
- **Never use `MongoMemoryServer` for tests that use transactions** — use `MongoMemoryReplSet` (replica set required for multi-document transactions)
- **Never trust GridFS files without school boundary** — missing `metadata.school_id` must fail closed (403), not be skipped

### File Conventions
- Dashboard files contain view routing logic and mount panel components from `components/{role}/`; heavy panels (> ~150 lines) live in their own component files
- API lib functions live in `frontend/src/lib/` — never `fetch()` directly from components
- Backend routes: one file per domain concern
- Model files: export both the Mongoose model AND the TypeScript interface (`IUser`, `IHomework`, etc.)
- Use `mongoose.models.Foo ?? mongoose.model(...)` pattern to avoid model re-registration errors
- GridFS bucket helper lives in `backend/src/lib/gridfs.ts` — do not redefine `getGridFSBucket()` in individual route files
- BullMQ queue helpers live in `backend/src/jobs/queue.ts` — never create raw Queue instances outside this file

---

## 10. Build and Run Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # Dev server → http://localhost:5173
npm run build        # Production build → frontend/dist/
npm run preview      # Preview production build
npx tsc --noEmit    # Type check only (must return 0 errors before any commit)
```

### Backend
```bash
cd backend
npm install
npm run dev          # Dev server with hot reload → http://localhost:4000
                     # = tsx watch --env-file=.env src/index.ts
npm run build        # TypeScript → dist/
npm run start        # Production: node --env-file=.env dist/index.js
npm run test         # Vitest unit tests
npx tsc --noEmit    # Type check only (must return 0 errors before any commit)
```

### E2E Tests
```bash
# From project root
npx playwright install   # First time only — installs browser binaries
npx playwright test      # Headless E2E run (requires both servers running)
npx playwright test --ui # Interactive UI mode
```

### Docker (production)
```bash
# From project root
docker-compose up -d     # Starts all 6 services (MongoDB replica set + Redis + backend + nginx)
docker-compose down      # Stop all services
```

### Required `.env` — Backend (`backend/.env`)
```
MONGODB_URI=mongodb://localhost:27017/teachscript
JWT_SECRET=<min 32 chars, random — server refuses to start if too short>
FRONTEND_URL=http://localhost:5173
ANTHROPIC_API_KEY=sk-ant-...
BACKEND_URL=http://localhost:4000
APPROVAL_SECRET=<hmac secret for signup approval links>
RESEND_API_KEY=re_...          # Email delivery via Resend
FROM_EMAIL=onboarding@resend.dev
OWNER_EMAIL=admin@yourschool.com
RAZORPAY_KEY_ID=rzp_...        # Payments (optional)
RAZORPAY_KEY_SECRET=...        # Payments (optional)
WHATSAPP_API_TOKEN=...         # WhatsApp Business API (optional)
WHATSAPP_PHONE_NUMBER_ID=...   # WhatsApp (optional)
REDIS_URL=redis://localhost:6379   # Optional — distributed auth cache + BullMQ queues
PISTON_URL=http://piston:2000      # Optional — code execution sandbox (Docker); returns 503 if not set
ALLOWED_ORIGINS=https://app.teachscript.in,https://staging.teachscript.in  # Optional — multi-domain CORS; falls back to FRONTEND_URL
FAST2SMS_API_KEY=...           # Optional — SMS OTP delivery (Fast2SMS, recommended for India)
TWILIO_ACCOUNT_SID=...         # Optional — SMS OTP delivery (Twilio, fallback)
TWILIO_AUTH_TOKEN=...          # Optional — SMS OTP delivery (Twilio)
TWILIO_FROM_NUMBER=...         # Optional — SMS OTP delivery (Twilio)
MONGO_INITDB_ROOT_USERNAME=...  # Required in production Docker — MongoDB auth
MONGO_INITDB_ROOT_PASSWORD=...  # Required in production Docker — MongoDB auth
BACKUP_S3_BUCKET=...            # Optional — daily mongodump S3 sync target (docker-compose mongo-backup sidecar)
# SENTRY_DSN=https://...       # Optional — error tracking via Sentry
# LOG_LEVEL=info               # Optional — pino log level (default: debug in dev, info in prod)
NODE_ENV=development
```

### Required `.env` — Frontend (`frontend/.env`)
```
VITE_BACKEND_URL=http://localhost:4000
```

### Docker (production)
`docker-compose.yml` runs 6 services:
- **mongo:7** — replica set (rs0, required for transactions), auth enabled (`MONGO_INITDB_ROOT_USERNAME/PASSWORD`)
- **mongo-init** — one-shot `rs.initiate()` sidecar
- **mongo-backup** — daily `mongodump` at 02:00 IST, 7-day local retention, optional S3 sync (`BACKUP_S3_BUCKET`)
- **redis:7** — AOF persistence (`--appendonly yes`), health check
- **backend** — Node.js app, `TZ=Asia/Kolkata` env var (IST for attendance/midnight-clockout), health check (`/health/detailed`)
- **nginx:1.27** — TLS termination, routes `/api/*` → backend, `/*` → frontend; full CSP header set

All services use JSON log drivers with per-file size limits to prevent disk exhaustion.

### CI Pipeline (`.github/workflows/ci.yml`)
On every push and pull request to **any branch** — three jobs run in order:
1. **unit** — Type-check both packages (`npx tsc --noEmit`), run `npm audit --audit-level=high` (fails on high/critical CVEs), **SAST** (eslint-plugin-security on backend src/, `--max-warnings 30`), run backend Vitest unit tests + frontend tests
2. **trivy** (needs: unit) — Builds the backend Docker image and scans it with Trivy for CRITICAL/HIGH unpatched vulnerabilities; fails the build if any are found
3. **e2e** (needs: unit) — Starts MongoDB as a **replica set** (`--replSet rs0` + `rs.initiate()`), builds + starts backend and frontend dev server, runs Playwright E2E suite; uploads report artifact on failure

---

## 11. Feature Implementation Order

When adding any new feature, always follow this sequence:

### Step 1 — Model (`backend/src/models/`)
Define Mongoose schema + TypeScript interface. Add proper indices. Export using `mongoose.models.Foo ?? mongoose.model(...)` to prevent re-registration.

### Step 2 — Route (`backend/src/routes/`)
Add route handler (or create new file). Always:
- Call `requireAuth` middleware first
- Check `user.role` at top of handler
- Verify `school_id` boundary on every query
- Use `validateObjectId(id)` from `lib/validateId.ts` before any ObjectId conversion
- Use `.select()` and `.lean()`
- Return `{ error: string }` on failure, typed data on success
- Register the router in `backend/src/index.ts`
- Log errors with `req.log?.error({ err }, "description")` — never `console.error`

### Step 3 — API Lib (`frontend/src/lib/`)
Add typed function in the appropriate lib file. Use `apiFetch()`. Define return type as `Data | { error: string }`.

### Step 4 — Component / Page (`frontend/src/pages/`)
Add view inside the relevant dashboard file:
- Add new value to the `View` type union
- Add entry to `VIEW_MAP`
- Add item to `NAV_ITEMS`
- Add label to `DashboardLayout.tsx` `NAV_SECTIONS` for the correct role
- Use lazy loading pattern (`loaded` state + `useEffect` guard)
- Always check `"error" in res` before using API data
- For heavy panels (> ~150 lines): extract into `components/{role}/PanelName.tsx`

### Step 5 — TypeScript Check
```bash
npx tsc --noEmit   # in both frontend/ and backend/ — must return 0 errors
```

### Step 6 — Unit Tests
Add a test file in `backend/src/tests/` for any new route logic that has edge cases (validation, formulas, access control). Use the `helpers.ts` factories and `MongoMemoryReplSet` (not `MongoMemoryServer` — replica set is required for transaction support). Use `createClass()` without hardcoding grade/section to avoid unique index collisions across tests.

### Step 7 — Playwright Test

**NEVER write a one-off `.mjs` script in the project root.** Always add tests to the dedicated `e2e/` folder.

1. Verify `http://localhost:4000/api/auth/me` returns 401
2. Verify `http://localhost:5173` returns 200
3. **Add test cases to the appropriate existing spec** in `e2e/` (e.g. auth.spec.ts, homework.spec.ts) OR create `e2e/feature-name.spec.ts` for a new feature area. Never write throwaway `.mjs` scripts.
4. Reuse the `login()` helper already defined in `e2e/auth.spec.ts` — import or copy it. Never inject cookies.
5. Run with: `npx playwright test e2e/feature-name.spec.ts --headed --project=chromium` (or the specific file). `playwright.config.ts` has `headless: true` by default — pass `--headed` for local Phase 5 runs so you can see the browser.
6. Take screenshots inside the spec with `await page.screenshot({ path: "ss_name.png" })` at every major step — read and verify each one inline in Phase 5 output. Delete all `ss_*.png` files after Phase 5 passes.
7. Test negative cases and regression cases
8. After Phase 5 passes: **keep the spec file permanently** — it becomes part of the CI E2E suite. Never delete spec files. Only delete screenshots.

**Reusable login credentials** (defined once here, referenced in all specs):
```ts
const STUDENT = { identifier: "5c4",                         password: "TS@GHZg5b8",   role: "student" as const }
const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234", role: "teacher" as const }
const ADMIN   = { identifier: "ksn1203003@gmail.com",         password: "Admin@1234",   role: "admin"   as const }
```

---

## 12. Pending Work

All security, reliability, performance, code quality, and DevOps engineering items have been implemented across four audit cycles. Two operational items remain — they require external registration before going live.

### Operational Gaps (Code Complete — Provider Setup Needed)

| Priority | ID | Item | Blocker |
|----------|----|------|---------|
| P2 | C-27 / C-34 | SMS 2FA + SMS passwordless login | `lib/sms.ts` implemented. Set `FAST2SMS_API_KEY` (recommended for India) or Twilio env vars. Remaining: DLT-registered sender ID + SMS template with telecom operator (TRAI requirement — 24–48 h). |
| P3 | — | AuditLog admin UI | `GET /api/school/audit-log` endpoint exists and is fully functional. Remaining: build an admin panel component to display the log with actor/action filters and pagination. No backend work needed. |

### Completed in the fourth engineering audit (June 2026)
- JWT token revocation via `token_version` field on User — signout increments it; middleware rejects stale JWTs instantly
- Redis sliding-window AI rate limiter (per-user, cross-process) — replaces per-process LRU; LRU remains as Redis fallback
- Parent route school-boundary guards — cross-school child access prevented on all 5 parent endpoints
- Module items capped at 200 via Mongoose validator — prevents MongoDB BSON 16MB document limit being hit
- Docker-compose hardening — MongoDB `--auth`, Redis AOF, daily `mongodump` backup sidecar, JSON log drivers with size limits
- CI E2E MongoDB replica set — `--replSet rs0` + `rs.initiate()` step; multi-document transactions now tested correctly
- Unit test replica set — `MongoMemoryReplSet` replaces `MongoMemoryServer` in `tests/helpers.ts`
- Homework concurrent upsert test — 5 simultaneous submissions verify exactly 1 DB document
- Quiz test fixes — route names, response shapes, concurrent submit, `max_attempts` handling
- New E2E spec `e2e/lessons.spec.ts` — 7 end-to-end tests (teacher/student lessons flow, file token auth, AI auth, health endpoint)
- Fast2SMS response checking — throws if `!smsRes.ok` so `withRetry` retries on delivery failure

### Completed in the fifth engineering audit (June 2026) — Groups A–H
- **Group A** — Model validation: `Attendance.period` min:1 max:8; `Homework.description` maxlength:2000; `Quiz.questions` validator (1–100); Quiz toJSON strips `correct_index` unconditionally; `School.storage_used_bytes` + `PLAN_STORAGE_QUOTAS` + `PLAN_ORDER` constants
- **Group B** — Safari cross-tab logout: `localStorage storage` event listener added to `AuthContext.tsx` alongside BroadcastChannel — covers Safari <15.4 and iOS WKWebView
- **Group C** — Timezone hardening: `TZ=Asia/Kolkata` added to backend service in `docker-compose.yml` — makes midnight clock-out and IST date comparisons correct in all environments
- **Group D** — GridFS school boundary: `scripts/migrateFileMetadata.ts` migration script; `routes/files.ts` school boundary check now mandatory (fail-closed); missing `metadata.school_id` → 403
- **Group E** — Report card query batching: `fetchReportCardDataBatch()` added to `services/reportCard.ts` — reduces N×5 DB round-trips to ~5 for bulk PDF generation via `$in` queries
- **Group F** — Storage quota + plan gates + AuditLog: `lib/planGate.ts` middleware; `models/AuditLog.ts` (2-year TTL); quota check + `$inc`/`$max(0,$subtract)` in `routes/modules.ts`; `requirePlan` gate on `routes/ai.ts`; AuditLog writes in `routes/dpdp.ts` and `routes/marks.ts`; `GET /api/school/audit-log` in `routes/school.ts`
- **Group G** — Test coverage: `planGate.test.ts` (4), `storageQuota.test.ts` (5), `auditLog.test.ts` (4); `helpers.ts createClass()` randomised section; `ai.test.ts` updated for plan gate — 15 test files, ~111 tests total
- **Group H** — SAST + CI: eslint-plugin-security added to CI unit job; CI branches changed from `["main","master","develop"]` to `["**"]` to cover all PRs

### Completed in the third engineering audit (June 2026)
- Content-Security-Policy header added to `nginx/nginx.conf` — covers frontend static files (was missing, P0)
- localStorage PII cleanup on signout — `ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*` keys removed in `AuthContext.handleSignOut` (P0)
- Open redirect fixed in `LoginPage.tsx` — `?redirect=` param validated via URL origin-pinning before use (P0)
- OTP TOCTOU race fixed in `routes/auth.ts` — atomic MongoDB aggregation pipeline update replaces separate find + update (P0)
- AbortController + X-Request-ID added to all 7 frontend API lib files (userApi, studentApi, moduleApi, marksApi, homeworkApi, dpdpApi, parentApi) (P1)
- `lib/sms.ts` created — SMS delivery abstraction (Fast2SMS + Twilio) mirroring `lib/email.ts`; extracted from inline auth.ts code (P1)
- zxcvbn password strength enforcement — score < 2 rejected on set/change/reset flows, client-side meter in `SetPasswordPage.tsx` (P1)
- `warmOutstandingTemplate()` exported from `lib/pdf.ts` and called at server startup to pre-warm certificate image cache (P1)
- ALLOWED_ORIGINS CORS — multi-domain support via comma-separated env var in `index.ts` (P1)
- X-Request-ID echoed in all API responses via middleware in `index.ts` (P1)
- `isPrivateIp()` CIDR bug fixed — `172.2xx.x.x` public IPs no longer incorrectly match the 172.16.0.0/12 private range (P2)
- BullMQ worker drain on shutdown — SIGTERM waits for workers to finish before exit; graceful drain replaces forced kill (P2)
- `validateEnv()` uses structured pino logger instead of `console.warn` (P2)

### Completed in the second engineering audit (June 2026)
- Homework deadline enforcement — student cannot submit after `due_date` (`routes/homework.ts`)
- Homework feedback ownership check — teacher can only give feedback on their own assignments (`routes/homework.ts`)
- Challenge language stored from challenge definition, not request body (`routes/challenges.ts`)
- Challenge DELETE school boundary check before ownership — cross-school probe returns 404 not 403 (`routes/challenges.ts`)
- File token consumption made atomic via `findOneAndDelete` — prevents race condition on concurrent requests (`routes/files.ts`)
- Parent attendance route replaced full-collection scan with targeted aggregation pipeline (`routes/parent.ts`)
- BullMQ queue depth added to `/health/detailed` response (`index.ts`)
- LibreOffice availability check at `pptxWorker` startup — logs warning immediately if absent (`jobs/pptxWorker.ts`)
- `buildReportCardHTML` extracted to `lib/reportCardTemplate.ts` — independently testable, no duplication (`routes/marks.ts`)
- Unified email delivery abstraction in `lib/email.ts` — Resend → Nodemailer/Gmail fallback; `nodemailer` removed from `auth.ts`, `signup.ts`, `users.ts`
- Four new test files: `challenges.test.ts` (6 cases), `files.test.ts` (3 cases including atomic race test), `homework.test.ts` additions (deadline + ownership), `certificates.test.ts` additions (66% boundary, 100% success)
- Frontend: `credentials: "include"` added to activity-PDF and AI-assistant fetch calls in `TeacherDashboard.tsx`
- Frontend: `.catch(console.error)` replaced with `.catch(() => {})` in blob viewer error handlers (`TeacherDashboard.tsx`, `StudentDashboard.tsx`)

### Completed in the first engineering audit (June 2026)
- Piston API sandbox replacing unsafe Python `spawn` in `routes/run.ts`
- `app.set("trust proxy", 1)` so rate limiters see real IPs behind nginx
- Crypto-secure OTP via `randomBytes` replacing `Math.random` in `routes/auth.ts`
- Role-based JWT expiry (admin/teacher = 8h, student/parent = 1d)
- `link_url` schema validation (must start with `http://` or `https://`) in `models/Module.ts`
- Attendance DB query fix in `routes/marks.ts` (filter at DB level, leverages compound index)
- HTTP Range (206) support for video seeking in `routes/files.ts`
- New compound index `{module_id, student_id}` on `ModuleProgress`
- Shared `fetchReportCardData()` service extracted to `services/reportCard.ts`
- `assertReplaced()` post-substitution guard in `lib/pdf.ts`
- SIGTERM/SIGINT handler in `jobs/pptxWorker.ts` killing active LibreOffice child processes
- SMS OTP delivery wrapped in `withRetry` (3 attempts, 500ms base)
- Vitest coverage thresholds raised to lines: 70, functions: 70, branches: 65
- Four new test files: `modules.test.ts`, `quizzes.test.ts`, `certificates.test.ts`, `ai.test.ts`
- `npm audit` gate (high/critical) + Trivy Docker scan added to CI pipeline
# CLAUDE.md — TeachScript (ClassroomAI)

## ⚡ CRITICAL — READ THIS EVERY MESSAGE

The feature-pipeline output style is always active. For EVERY request:
1. ALWAYS run Phase 1 + Phase 2 first — no exceptions
2. ALWAYS wait for ✅ APPROVE before writing any code
3. ALWAYS run Phase 5 testing after implementing
4. ALWAYS run Phase 6 confirmation when done
5. These rules apply to the 1st message AND the 50th message equally

---

## 1. What This App Is

**TeachScript** is a school classroom management platform for Indian schools (Classes 3–8). It serves four roles: teachers upload lessons and push coding challenges/quizzes/homework to their class; students consume lessons, attempt quizzes, write code, submit homework, and track their attendance and marks; admins manage the school's classes, teachers, students, and compliance; parents get a read-only view of their child's progress. The AI assistant (Claude Sonnet 4.6) helps teachers simplify concepts, generate activities, and translate content to Hindi for CBSE/State/ICSE curricula.

---

## 2. Full Tech Stack

### Frontend
| Layer | Tool / Version |
|---|---|
| Framework | React 19.2.4 |
| Router | React Router 7.14.2 |
| Build | Vite 7.3.1 |
| Styling | Tailwind CSS 4.2.1 + tailwind-merge |
| UI Components | shadcn/ui + Radix UI primitives |
| Icons | Lucide React |
| Charts | Recharts 3.8.0 |
| Forms | React Hook Form + Zod |
| Password strength | zxcvbn (score < 2 rejected on SetPasswordPage) |
| Excel Export | XLSX 0.18.5 |
| DOCX conversion | mammoth ^1.12.0 |
| PWA | vite-plugin-pwa + Workbox |
| E2E Tests | Playwright |
| Path alias | `@` → `frontend/src/` |

### Backend
| Layer | Tool / Version |
|---|---|
| Runtime | Node.js with tsx watch (dev) |
| Framework | Express 4.21.2 |
| Database | MongoDB via Mongoose 9.6.1 |
| Auth | bcryptjs 3.0.3 + jsonwebtoken 9.0.3 |
| AI | @anthropic-ai/sdk 0.32.1 (claude-sonnet-4-6) |
| Password strength | zxcvbn (backend validation: score < 2 rejected on change-password + reset-password) |
| File storage | GridFS (in MongoDB) via multer |
| PDF gen | Puppeteer 23.11.1 (singleton browser — `getBrowser()` in lib/pdf.ts) |
| PPTX→PDF | libreoffice-convert 1.8.1 |
| Email | Nodemailer 8.0.7 + Resend 4.0.0 |
| Payments | Razorpay 2.9.4 |
| Security | Helmet 8, CORS, express-rate-limit 7.4.1 |
| Logging | pino + pino-http (JSON structured logs with requestId) |
| Job queues | BullMQ (PPTX + PDF async workers) — optional Redis required |
| Cache | Redis (distributed auth cache) — optional, falls back to in-process Map |
| Error tracking | Sentry (optional — only if SENTRY_DSN set) |
| Unit tests | Vitest |
| Port | 4000 (default) |

---

## 3. User Roles and Features

### Student
- **Dashboard**: modules completed, points, quiz score %, attendance %, streak days, weekly activity chart, continue-learning shelf, upcoming events, classmates leaderboard
- **Lessons**: browse modules by subject, view PDF/file/video/Google Drive/YouTube items, progress tracked per item
- **Timetable**: read-only timetable from class schedule
- **Quizzes**: attempt MCQ quizzes, see score + explanations, one attempt per quiz
- **Homework**: view assigned homework with due dates and status badges (Pending/Done/Late); submit text answers; view teacher feedback and marks
- **My Marks**: view all exam results — marks per subject, percentage, letter grade (A+→F); download PDF report card
- **Certificates**: claim certificate when ≥70% of module items viewed; download as PDF
- **My Attendance**: calendar view of attendance by date; period-wise status (present/absent/late); attendance rate = `(present + late×0.5) / total`
- **Live Code Editor**: JavaScript/Python/HTML editor with iframe sandbox execution; teacher-assigned challenges with deadline; re-submit before deadline
- **Teachers**: view list of teachers in their class
- **Settings**: update name, language preference (English/Hindi), WhatsApp number, profile photo; request data deletion (DPDP Act 2023)

### Teacher
- **Dashboard**: student avg progress, quick-push challenge/quiz
- **Lessons**: create/rename/delete modules per subject+class; upload PPTX→PDF/video/images; add Drive/YouTube links; reorder modules and items via drag
- **Timetable**: configure day+period+subject+teacher+times for assigned classes
- **Attendance**: select date + class + period; mark each student present/absent/late; weight display (Present=100%, Late=50%, Absent=0%); cannot mark future dates
- **Students**: view class list, bulk add via CSV
- **Quizzes**: create MCQ quizzes (2–4 options), push to class, view per-student results
- **Homework**: create homework assignments (subject, title, description, due date) per class; view all student submissions; give written feedback and marks per submission
- **Marks**: create exams (unit test, mid-term, final, practical, other) with subjects and max marks; enter marks per student per subject; view class-wide results with percentage and letter grade; download individual student PDF report cards
- **Live Code**: create coding challenges (title, difficulty, language, description, constraints, expected output, deadline, class); view student submissions with expandable code preview
- **Certificates**: view issued certificates per class; customise certificate template (logo, colours, footer text); bulk download ZIP; issue custom certificates
- **AI Assistant**: ask lesson questions in English/Hindi; Claude responds with CBSE-aligned suggestions (30 requests/min per user)
- **Notifications**: broadcast announcements/reminders/achievements/alerts/events; schedule for later
- **Sunday Sync**: weekly planning tool
- **Settings**: profile photo, name, language; request data deletion (DPDP Act 2023)

### Admin
- **Overview**: school stats (teachers, students, classes), create new classes
- **Classes**: list all classes, edit name/subjects, view timetable audit trail (last 10 versions)
- **Teachers**: invite by email, assign to classes/subjects, bulk import CSV
- **Students**: add single or bulk CSV, assign to classes
- **Timetable**: view/edit timetables across all classes (conflict detection enforced)
- **Marks**: school-wide exam management and marks oversight
- **Certificates**: view all issued certificates school-wide
- **Reports**: activity PDF, board compliance report (Puppeteer PDF)
- **Data Requests**: DPDP Act 2023 compliance — review and approve/reject user data deletion requests; approved requests soft-deactivate the user
- **Notifications**: create school-wide announcements with scheduling
- **Settings**: school info (name, board, city, state, UDISE code), subscription plan

### Parent
- **Read-only portal**: view their linked child's attendance, lesson progress, quiz results, homework submissions, exam marks, and certificates
- **No write access**: parents cannot mark attendance, submit answers, or modify any data

---

## 4. Folder Structure

```
ClassroomAI/
├── CLAUDE.md                          # This file
├── README.md                          # Project overview and setup guide
├── docker-compose.yml                 # Production compose (backend + MongoDB + Redis)
├── docker-compose.override.yml        # Dev overrides (e.g. exposed ports)
├── playwright.config.ts               # Playwright E2E test config
├── package.json                       # Root package (playwright dependencies)
│
├── e2e/                               # Playwright end-to-end tests
│   ├── auth.spec.ts                   # Login/logout/redirect tests
│   ├── homework.spec.ts               # Teacher create → student submit flow
│   ├── marks.spec.ts                  # Exam create → marks entry → report card
│   └── school-boundary.spec.ts        # Cross-school data isolation tests
│
├── frontend/                          # React app (Vite)
│   ├── package.json
│   ├── vite.config.ts                 # Vite + PWA config, "@" alias → src/
│   ├── tailwind.config.*
│   ├── index.html
│   ├── .env                           # Local env vars (not committed)
│   ├── .env.example
│   │
│   └── src/
│       ├── main.tsx                   # React root render
│       ├── App.tsx                    # BrowserRouter, ThemeProvider, AuthProvider, all Routes, PWAUpdateBanner
│       │                              # All 4 dashboard routes use React.lazy() for code splitting
│       │
│       ├── contexts/
│       │   └── AuthContext.tsx        # useAuth() hook — user state, signOut, refreshUser
│       │                              # Cross-tab logout via BroadcastChannel.postMessage()
│       │                              # await authSignOut() — never fire-and-forget
│       │                              # handleSignOut clears localStorage keys matching ts_avatar_*, ts_clock_*, teachscript_avatar_* (PII/DPDP cleanup on logout)
│       │
│       ├── lib/
│       │   ├── auth.ts                # signIn, signOut, getCurrentUser, password reset
│       │   ├── userApi.ts             # Admin/Teacher API: classes, timetable, attendance, users, notifications
│       │   ├── studentApi.ts          # Student API: dashboard, quizzes, challenges, certificates, activity
│       │   ├── moduleApi.ts           # Module/lesson API: CRUD, file upload, item management
│       │   ├── marksApi.ts            # Marks API: exams CRUD, results, downloadReportCard, downloadMyReportCard
│       │   ├── homeworkApi.ts         # Homework API: CRUD, submissions, feedback (teacher + student)
│       │   ├── dpdpApi.ts             # DPDP Act API: requestDataDeletion, getDeletionRequests, reviewDeletionRequest
│       │   ├── parentApi.ts           # Parent portal API: child profile, progress, attendance, marks
│       │   └── utils.ts               # cn() Tailwind merge helper
│       │   All 7 API lib files (userApi, studentApi, moduleApi, marksApi, homeworkApi, dpdpApi, parentApi) share a
│       │   consistent internal apiFetch() with: 30-second AbortController timeout, X-Request-ID header (UUID per call),
│       │   and requestId echoed back in error returns so error UI can surface it to users.
│       │
│       ├── pages/
│       │   ├── StudentDashboard.tsx   # Student view switcher — delegates heavy sub-views to components/student/
│       │   ├── TeacherDashboard.tsx   # Teacher view switcher — delegates heavy sub-views to components/teacher/
│       │   ├── AdminDashboard.tsx     # Admin view switcher — delegates heavy sub-views to components/admin/
│       │   ├── ParentDashboard.tsx    # Parent portal (read-only child progress view)
│       │   ├── LoginPage.tsx          # Role-tabbed login (Student/Teacher/Admin/Parent) with DPDP privacy notice
│       │   ├── SignupPage.tsx         # School signup → pending approval flow; DPDP consent checkbox on final step
│       │   ├── ForgotPasswordPage.tsx # Email OTP password reset
│       │   ├── SetPasswordPage.tsx    # Create/reset password via token (also handles must_change_password flow)
│       │   │                          # zxcvbn strength meter: 4 color-coded bars + label; score < 2 blocked client-side and server-side
│       │   ├── HomePage.tsx           # Public landing page
│       │   ├── PricingPage.tsx        # Pricing plans page
│       │   ├── ForSchoolsPage.tsx     # B2B marketing for schools
│       │   ├── ForTeachersPage.tsx    # Teacher-focused benefits page
│       │   ├── LegalPage.tsx          # Terms/Privacy (routed via /legal/:type)
│       │   └── NotFoundPage.tsx       # 404 fallback
│       │
│       └── components/
│           ├── DashboardLayout.tsx    # Shared shell: sidebar (desktop), bottom nav (mobile), topbar; NAV_SECTIONS whitelist controls which items appear per role
│           ├── TimetableDisplayView.tsx  # Day×Period grid, editable timetable component
│           ├── ErrorBoundary.tsx      # React error boundary with fallback UI
│           ├── ProgressBar.tsx        # SVG animated progress ring
│           ├── PWAUpdateBanner.tsx    # Banner shown when new service worker is waiting — user controls when to update
│           ├── SkeletonCard.tsx       # Reusable skeleton loading card for list views
│           ├── Navbar.tsx             # Public site top navigation
│           ├── Footer.tsx             # Public site footer
│           ├── LoginModal.tsx         # Login modal overlay
│           ├── mode-toggle.tsx        # Light/dark theme button
│           ├── theme-provider.tsx     # Theme context (localStorage key: teachscript-theme)
│           ├── admin/                 # Admin dashboard panel components
│           │   ├── adminShared.tsx    # Shared types and helpers used across admin panels
│           │   ├── adminComponents.tsx # Shared UI components (tables, modals) used across admin panels
│           │   ├── AdminOverviewPanel.tsx  # School stats overview panel
│           │   ├── AdminClassesPanel.tsx   # Classes CRUD + timetable audit trail
│           │   ├── AdminTeachersPanel.tsx  # Teacher invite + assignments panel
│           │   └── AdminStudentsPanel.tsx  # Student add/import/assign panel
│           ├── teacher/               # Teacher dashboard panel components
│           │   ├── TeacherHomeworkPanel.tsx  # Homework creation, submission review, feedback
│           │   └── TeacherMarksPanel.tsx     # Exam creation, marks entry, report card download
│           ├── student/               # Student dashboard panel components
│           │   ├── StudentHomeworkPanel.tsx  # Homework list + answer submission
│           │   └── StudentMarksPanel.tsx     # My marks view + report card download
│           └── ui/                    # shadcn/ui primitives (button, input, dialog, etc.)
│
└── backend/                           # Express API server (TypeScript)
    ├── package.json
    ├── vitest.config.ts               # Vitest unit test config; coverage thresholds: lines 70, functions 70, branches 65
    ├── Dockerfile                     # Multi-stage Docker build (node:22-slim)
    ├── .env                           # Local env vars (not committed)
    ├── .env.example                   # Documented template for all env vars
    │
    └── src/
        ├── index.ts                   # Express app entry — rate limits, route mounting, Sentry, pino-http, graceful shutdown
        │                              # ALLOWED_ORIGINS: comma-separated env var for multi-domain CORS (falls back to FRONTEND_URL)
        │                              # X-Request-ID: echoes incoming header (or generates UUID) back in every response
        │                              # isPrivateIp(): CIDR-correct RFC-1918 check — gates /metrics endpoint (fixes 172.2x.x.x false-positive bug)
        │                              # warmOutstandingTemplate() called on startup to pre-warm certificate image cache
        │
        ├── middleware/
        │   └── auth.ts                # requireAuth (JWT cookie/header), requireAdmin, setTokenCookie
        │                              # Role + school_id cached for 30s (Redis if available, else in-process Map)
        │                              # JWT role claim intentionally ignored — DB role is always authoritative
        │                              # token_version check: if JWT tv claim < DB token_version, token rejected immediately (revocation on signout)
        │
        ├── lib/
        │   ├── mongodb.ts             # Mongoose connect (maxPoolSize: 50), drops stale attendance index on start
        │   ├── claude.ts              # Anthropic SDK client, getLessonAssistantResponse(question, context, language)
        │   ├── pdf.ts                 # getBrowser() singleton + renderHtmlToPdf() + generateCertificatePDF(CertificateData) → Buffer
        │   │                          # Circuit breaker + concurrency slots; getPuppeteerStatus() for health check
        │   │                          # assertReplaced() guard throws if a template placeholder is not substituted
        │   │                          # warmOutstandingTemplate() — pre-warms CDN image cache at startup; exported and called in index.ts on server start
        │   ├── gridfs.ts              # getGridFSBucket(bucketName) — shared helper for GridFS access
        │   │                          # BucketName = "lesson_files" | "uploads" | "pdf_reports"
        │   ├── redis.ts               # getRedis() — returns IORedis client or null if REDIS_URL not set
        │   │                          # getBullMQConnection() — returns BullMQ connection or null
        │   ├── logger.ts              # pino logger — JSON structured logs; LOG_LEVEL from env
        │   ├── retry.ts               # withRetry(fn, retries, delayMs) — exponential backoff helper
        │   ├── validateId.ts          # validateObjectId(id) — throws 400 if not a valid Mongoose ObjectId
        │   ├── email.ts               # sendEmail({to, subject, html}) — tries Resend (RESEND_API_KEY), falls back to Nodemailer/Gmail (EMAIL_USER + EMAIL_APP_PASSWORD), logs warning if neither set
        │   ├── sms.ts                 # sendSms(phone, otp, userName) — tries Fast2SMS (FAST2SMS_API_KEY), falls back to Twilio (TWILIO_ACCOUNT_SID+AUTH_TOKEN+FROM_NUMBER), logs info if neither configured; extracted from auth.ts to mirror email.ts pattern
        │   ├── planGate.ts            # requirePlan(...allowedPlans) Express middleware factory — returns 402 if school plan not in allowed list
        │   │                          # PLAN_ORDER: free(0) < starter(1) < standard(2) < premium(3); plan cached 30s (Redis + in-process fallback)
        │   ├── reportCardTemplate.ts  # buildReportCardHTML(ReportCardTemplateData) → HTML string; extracted from marks.ts so it can be unit-tested independently
        │   ├── supabase.ts            # Stub (Supabase removed; kept to avoid import crashes)
        │   └── validateEnv.ts         # Checks required env vars on startup — throws if JWT_SECRET is weak
        │
        ├── jobs/
        │   ├── queue.ts               # BullMQ queue helpers: getPptxQueue(), getPdfQueue(),
        │   │                          # queuePdfGeneration(PdfJobData) → jobId | null
        │   │                          # PdfJobData, PdfJobResult, PdfJobType interfaces
        │   ├── pptxWorker.ts          # BullMQ worker: PPTX → PDF conversion (LibreOffice), concurrency: 2
        │   │                          # SIGTERM/SIGINT handler kills active LibreOffice child processes cleanly
        │   │                          # startPptxWorker() / stopPptxWorker()
        │   ├── pdfWorker.ts           # BullMQ worker: HTML → PDF (Puppeteer), stores in GridFS pdf_reports bucket
        │   │                          # Issues 10-min FileToken; sync fallback if Redis not configured
        │   │                          # startPdfWorker() / stopPdfWorker() / generatePdfSync()
        │   ├── midnightClockOut.ts    # Scheduled job: auto-clocks-out all active sessions at midnight IST
        │   └── convertExistingPptx.ts # One-time background job on startup: converts legacy PPTX files to PDF
        │
        ├── models/
        │   ├── User.ts                # Users (all roles), school_id, class_id, points, preferred_language, must_change_password
        │   │                          # token_version field — incremented on signout; middleware rejects JWTs with tv < token_version
        │   ├── School.ts              # School record, board, subscription_plan (free|starter|standard|premium)
        │   │                          # storage_used_bytes (incremented on upload, decremented on delete, floored at 0)
        │   │                          # exports PLAN_STORAGE_QUOTAS (free=2GB, starter=10GB, standard=50GB, premium=200GB) and PLAN_ORDER
        │   ├── Class.ts               # Class with timetable[], timetable_versions[] (last 10), teachers[]
        │   ├── Module.ts              # Lesson module with items[] (files + links); items array capped at 200 via validator
        │   ├── Quiz.ts                # Quiz with questions[], is_active; questions validator (1–100 items)
        │   │                          # toJSON transform strips correct_index unconditionally (defense-in-depth for non-lean routes)
        │   ├── QuizAttempt.ts         # Student quiz attempt, answers[], score, percentage
        │   ├── CodeChallenge.ts       # Coding challenge with difficulty, language, deadline
        │   ├── ChallengeSubmission.ts # Student code submission (upserted per student+challenge)
        │   ├── Certificate.ts         # Issued certificate, unique(student_id, module_id)
        │   ├── ModuleProgress.ts      # Item-level progress, unique(student_id, module_id, item_id)
        │   ├── StudentActivity.ts     # Daily activity (items_viewed, logins, minutes_active capped at 600)
        │   ├── TeacherSession.ts      # Teacher login/logout sessions per day
        │   ├── PasswordReset.ts       # Token hash + expiry (TTL index auto-deletes)
        │   ├── PendingSignup.ts       # School signup applications (pending|approved|rejected)
        │   ├── FileToken.ts           # Short-lived tokens for GridFS file access (TTL index)
        │   ├── CertTemplate.ts        # Per-school certificate template (logo, colours, footer text)
        │   ├── ExamDefinition.ts      # Exam with type, date, subjects[], grade_scale[] (default A+→F)
        │   ├── ExamResult.ts          # Per-student per-subject marks (unique on exam_id+student_id+subject)
        │   ├── Homework.ts            # Homework assignment (subject, title, description max 2000 chars, due_date, is_active)
        │   ├── HomeworkSubmission.ts  # Student submission (upsert unique on homework_id+student_id)
        │   ├── DataDeletionRequest.ts # DPDP Act deletion request (status: pending|approved|rejected)
        │   ├── OTPSession.ts          # 2FA/SMS-login OTP sessions (bcrypt-hashed OTP, TTL 10 min)
        │   ├── Notification.ts        # Notification record (school/class/user scoped)
        │   ├── NotifRead.ts           # Per-user notification read status
        │   ├── AuditLog.ts            # DPDP compliance audit log — school_id, actor_id, action, resource_type, before/after, IP, timestamp
        │   │                          # Indices: {school_id, timestamp:-1}, {actor_id, timestamp:-1}; TTL 2 years (auto-delete for data minimisation)
        │   └── Attendance.ts          # Attendance record per class/date/period; period field validated min:1 max:8
        │
        ├── services/
        │   └── reportCard.ts          # fetchReportCardData() — single-student data-fetching; fetchReportCardDataBatch() — batch
        │                              # Used by both teacher and student report-card routes to avoid duplication
        │                              # Batch path reduces N×5 DB round-trips to ~5 using $in queries for ExamResult + Attendance
        │
        ├── scripts/
        │   └── migrateFileMetadata.ts # One-time idempotent migration: populates metadata.school_id on GridFS files from Module docs
        │                              # Run: npx tsx --env-file=.env src/scripts/migrateFileMetadata.ts
        │
        ├── tests/                     # Vitest unit tests (15 files, ~111 tests total)
        │   ├── helpers.ts             # Test utilities (MongoMemoryReplSet, test factories); createClass() uses randomised section to avoid unique index collisions
        │   ├── auth.test.ts           # Password hashing, JWT validation, OTP atomicity, token_version revocation
        │   ├── attendance.test.ts     # Attendance formula, future-date rejection, IST timezone
        │   ├── marks.test.ts          # Grade calculation, bulk upsert school boundary
        │   ├── homework.test.ts       # Submission upsert, deadline enforcement, feedback ownership
        │   ├── school-boundary.test.ts # Cross-school data isolation
        │   ├── middleware.test.ts     # requireAuth, requireAdmin, role cache behaviour, token_version rejection
        │   ├── modules.test.ts        # GET modules (school boundary), POST module, DELETE module
        │   ├── quizzes.test.ts        # GET quizzes (no correct_index for students), submit, one-attempt, school boundary, concurrent race
        │   ├── certificates.test.ts   # Eligible modules, claim, duplicate claim, <70% rejection, data isolation
        │   ├── ai.test.ts             # Valid teacher request (starter plan), missing question (400), student forbidden (402/403), no auth (401), language forwarded
        │   ├── challenges.test.ts     # CRUD, school boundary, language from definition, concurrent submit
        │   ├── files.test.ts          # Token generation, atomic consumption race test, range header support
        │   ├── planGate.test.ts       # free plan → 402, starter/premium → 200, no-auth → 401
        │   ├── storageQuota.test.ts   # PLAN_STORAGE_QUOTAS constants, floor-at-zero decrement, increment, schema rejection
        │   └── auditLog.test.ts       # Create, query, school isolation, TTL field present
        │
        └── routes/
            ├── auth.ts                # signin, signout, me, forgot-password, reset-password, clock-in/out, verify-otp, send-sms-otp
            │                          # OTP via crypto.randomBytes (not Math.random); role-based JWT expiry (admin/teacher=8h, student/parent=1d)
            │                          # SMS OTP delivery wrapped in withRetry (3 attempts, 500ms base); Fast2SMS response status checked before withRetry decides to retry
            │                          # signout increments token_version → stale JWTs rejected immediately by middleware
            ├── signup.ts              # check-email, request, approve/:id, reject/:id
            ├── users.ts               # User management (admin): add/update/remove teachers & students
            ├── school.ts              # School info, classes CRUD, timetable save, notifications
            │                          # GET /api/school/audit-log — admin only, paginated, filterable by actor_id and action
            ├── teacher.ts             # Attendance, timetable, class-students, notifications, student-progress
            ├── student.ts             # Dashboard stats, activity ping/clockout, classmates, attendance
            ├── modules.ts             # Modules + items CRUD, GridFS file upload, magic-byte validation, PPTX→PDF queue
            │                          # Storage quota check before upload (413 if exceeded); $inc storage_used_bytes on success; atomic $max(0,$subtract) on delete
            ├── quizzes.ts             # Quiz CRUD, submit attempt, get results
            ├── challenges.ts          # Code challenge CRUD, submit (upsert), get submissions
            ├── marks.ts               # Exam CRUD, result entry (bulk upsert), buildReportCardHTML(), report card PDF via pdfWorker
            │                          # Data-fetch logic extracted to services/reportCard.ts; AuditLog written on every bulk marks upsert
            ├── homework.ts            # Homework CRUD, student submission (upsert), teacher feedback/marks
            │                          # Deadline enforced: students cannot submit after due_date; teacher ownership on feedback
            ├── dpdp.ts                # DPDP Act: create deletion request, list requests, approve/reject
            │                          # AuditLog written on every approve/reject decision
            ├── parent.ts              # Parent portal: read-only child progress, attendance, marks
            │                          # All endpoints verify child.school_id === parent.school_id (cross-school guard)
            ├── ai.ts                  # POST /lesson-assist → Claude response; requirePlan("starter","standard","premium") gate (free → 402)
            │                          # Redis sliding-window rate limit 30/min per user; LRU fallback when Redis unavailable
            ├── certificates.ts        # Certificate template, bulk generate, custom issue, revoke
            ├── studentCertificates.ts # Student: eligible modules, claim, download PDF
            ├── files.ts               # GridFS file streaming via TTL token; HTTP Range (206) support for video seeking
            │                          # School boundary mandatory (fail-closed): missing metadata.school_id → 403; token consumed atomically via findOneAndDelete
            ├── run.ts                 # Code execution via Piston API sandbox (PISTON_URL env var required)
            │                          # Returns 503 with friendly message if PISTON_URL not configured
            ├── reports.ts             # Activity PDF, compliance report (Puppeteer)
            ├── payments.ts            # Razorpay order create + webhook verify
            └── whatsapp.ts            # WhatsApp notification integration
```

---

## 5. MongoDB Models

### User
```
name, email (unique lowercase), phone, username (unique sparse),
gender, password_hash, role (student|teacher|admin|super_admin|parent),
school_id, class_id, is_active, preferred_language (english|hindi),
profile_photo_url, points, must_change_password, token_version (default 0), created_at
token_version is incremented on every signout — middleware rejects JWTs whose tv claim < DB value
Indices: {school_id, role}, {class_id}
```

### School
```
name, board, city, state, udise_code,
subscription_plan (free|starter|standard|premium),
storage_used_bytes (default 0, min 0 — incremented on upload, decremented on delete), created_at
Exports: PLAN_STORAGE_QUOTAS = { free: 2GB, starter: 10GB, standard: 50GB, premium: 200GB }
         PLAN_ORDER = { free: 0, starter: 1, standard: 2, premium: 3 }
```

### Class
```
school_id, grade (3-8), section, name (custom label),
subjects[], teachers[] [{teacher_id, subject}],
timetable[] [{day, period, subject, teacher_id, start_time, end_time}],
timetable_versions[] (last 10 snapshots for audit trail),
timetable_updated_at, timetable_updated_by
Unique index: {school_id, grade, section}
```

### Module
```
school_id, class_id, subject, title, order (auto-numbered), created_by,
items[] [{_id, order, type (file|link), label, gridfs_id, pdf_gridfs_id,
          file_name, file_type, file_size, link_url (validated: must start with http:// or https://),
          link_type (gdrive|youtube|other)}],
created_at, updated_at
items array capped at 200 via Mongoose validator (prevents BSON 16MB document limit)
Index: {school_id, class_id, subject, order}
```

### Quiz
```
school_id, class_id, created_by, title, is_active,
questions[] [{text, options[4], correct_index (0-3), explanation}],
created_at
questions array validator: 1–100 items
toJSON transform: strips correct_index unconditionally (defense-in-depth; routes using .lean() do their own strip)
Index: {school_id, class_id}
```

### QuizAttempt
```
quiz_id, student_id, school_id,
answers[] (selected option indices), score, total, percentage, submitted_at
Indices: {student_id, quiz_id} (unique — one attempt only), {school_id, quiz_id}, {student_id, submitted_at}
```

### CodeChallenge
```
school_id, class_id, created_by, title,
difficulty (Easy|Medium|Hard), language (javascript|python|html),
description, constraints, expected_output, deadline (Date|null),
is_active, created_at
Index: {school_id, class_id}
```

### ChallengeSubmission
```
challenge_id, student_id, school_id, code, language, submitted_at
Unique upsert on {challenge_id, student_id} — re-submit overwrites
Index: {student_id, challenge_id}
```

### Certificate
```
student_id, school_id, class_id, module_id (unique per student),
module_title, subject, class_label, student_name, type (module|custom), issued_at
Unique index: {student_id, module_id}
Indices: {school_id}, {student_id}
```

### ModuleProgress
```
student_id, module_id, item_id, viewed_at
Unique index: {student_id, module_id, item_id}
Indices: {student_id}, {module_id, student_id}  ← added for teacher student-progress panel query
```

### StudentActivity
```
student_id, school_id, date (YYYY-MM-DD),
items_viewed, logins, minutes_active (capped at 600/day)
Unique index: {student_id, date}
Index: {school_id, date}
```

### TeacherSession
```
teacher_id, school_id, date (YYYY-MM-DD IST), login_at, logout_at, duration_minutes
Indices: {teacher_id, date}, {school_id, date}
```

### PasswordReset
```
user_id, token_hash, expires_at, used
TTL index on expires_at — auto-deletes expired tokens
Single-use: checked with used: false, set to used: true on consumption
```

### PendingSignup
```
school_name, board, city, state, total_students,
admin_name, admin_email, admin_phone,
first_class_*, first_teacher_*,
status (pending|approved|rejected), reviewed_at, created_at
```

### FileToken
```
token (unique), userId, gridfsId, expiresAt
TTL index — auto-expires short-lived file access tokens (10 min default for PDF downloads)
```

### CertTemplate
```
school_id (unique per school), school_name,
logo_gridfs_id (nullable — school logo stored in GridFS),
description (template string with {module}/{subject}/{class}/{student}/{school} placeholders),
footer_left, footer_right, accent_color (hex, default #534AB7), updated_at
Unique index: school_id
```

### ExamDefinition
```
school_id, class_id, created_by, title,
exam_type (unit_test|mid_term|final|practical|other),
date,
subjects[] [{name, max_marks}],
grade_scale[] [{min, grade, label}] — default: A+(90), A(80), B+(70), B(60), C(50), D(40), F(0)
created_at
Index: {school_id, class_id, created_at:-1}
```

### ExamResult
```
exam_id, student_id, school_id, class_id, subject,
marks_obtained (number|null), is_absent (boolean)
Unique index: {exam_id, student_id, subject} — upserted on entry
Indices: {student_id, school_id}, {exam_id, school_id}
```

### Homework
```
school_id, class_id, created_by, subject, title,
description (max 2000 chars), due_date, is_active, created_at
Indices: {school_id, class_id, due_date:-1}, {created_by}
```

### HomeworkSubmission
```
homework_id, student_id, school_id,
answer_text (max 5000 chars), feedback (max 1000 chars), marks (number|null),
submitted_at, updated_at
Unique index: {homework_id, student_id} — upserted on re-submit
Indices: {student_id}, {school_id}
```

### DataDeletionRequest
```
user_id, user_name, user_email, user_role, school_id,
reason, status (pending|approved|rejected),
reviewed_at (optional), reviewed_by (optional),
created_at
Indices: {school_id, status}, {user_id}
```

### OTPSession
```
session_token_hash (unique), otp_hash (bcrypt),
user_id, email (nullable), phone (nullable),
channel (email|sms), role, school_id,
expires_at, used
TTL index on expires_at — auto-deletes after expiry (10 min window)
```

### Notification
```
school_id, class_id (nullable — null = school-wide), created_by,
type (announcement|reminder|achievement|alert|event),
title, message, scheduled_at (nullable), created_at
Indices: {school_id, created_at:-1}, {class_id}
```

### NotifRead
```
notification_id, user_id, read_at
Unique index: {notification_id, user_id}
Index: {user_id}
```

### Attendance
```
school_id, class_id, date (YYYY-MM-DD), period (min: 1, max: 8),
records[] [{student_id, status (present|absent|late)}],
marked_by, created_at
Unique index: {class_id, date, period}
Indices: {school_id, date}, {class_id, date}
```

### AuditLog
```
school_id, actor_id, actor_role, action (e.g. "marks.bulk_upsert", "dpdp.deletion_approved"),
resource_type, resource_id, before (object|null), after (object|null), ip, timestamp
Indices: {school_id, timestamp:-1}, {actor_id, timestamp:-1}
TTL index on timestamp — auto-deletes after 2 years (DPDP Act data minimisation)
Written by: routes/marks.ts (bulk upsert), routes/dpdp.ts (approve/reject)
Queried by: GET /api/school/audit-log (admin only, paginated, supports actor_id + action filters)
```

---

## 6. API Routes

All routes under `/api/*`. Auth = requires `ts_token` cookie or `Authorization: Bearer` header.

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signin` | No | Login with email/phone/username + password → sets ts_token cookie |
| POST | `/signout` | Yes | Clears ts_token cookie |
| GET | `/me` | Yes | Returns current user profile |
| POST | `/forgot-password` | No | Sends password reset email (rate limited: 5/15 min) |
| POST | `/reset-password` | No | Reset password via token (single-use) |
| POST | `/clock-in` | Yes | Record session start (daily active tracking) |
| POST | `/clock-out` | Yes | Record session end, persist duration to TeacherSession / StudentActivity |
| GET | `/clock-status` | Yes | Returns whether the user is currently clocked in |
| POST | `/send-sms-otp` | No | Send SMS OTP for passwordless login (rate limited: 5/15 min) |
| POST | `/verify-sms-otp` | No | Verify SMS OTP → issues JWT (rate limited: 10/15 min) |
| POST | `/verify-otp` | No | Verify 2FA email OTP → issues JWT |

### Signup — `/api/signup`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check-email` | No | Check if admin email is available |
| POST | `/request` | No | Submit new school signup application (rate limited) |
| GET | `/approve/:id` | No (HMAC token) | Approve school, create Admin user, send credentials |
| GET | `/reject/:id` | No (HMAC token) | Reject application, notify admin |

### School — `/api/school`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes (admin) | School info + teacher/student/class counts |
| PATCH | `/` | Yes (admin) | Update school info (name, board, city, state, UDISE code) |
| GET | `/classes` | Yes | All classes with timetable + student counts |
| POST | `/classes` | Yes (admin) | Create class (grade 3-8, section) |
| PATCH | `/classes/:id` | Yes (admin) | Rename class / update subjects |
| PATCH | `/classes/:id/teacher` | Yes (admin) | Assign/reassign teacher for a class |
| DELETE | `/classes/:id` | Yes (admin) | Soft-delete class + cascade delete modules/quizzes/challenges |
| PUT | `/classes/:id/timetable` | Yes | Save timetable slots (conflict detection enforced) |
| GET | `/teachers` | Yes | List all teachers in school |
| GET | `/students` | Yes | List all students in school |
| GET | `/my-student-info` | Yes (student) | Student's own profile info |
| GET | `/my-class` | Yes (student) | Student's class details and classmates |
| GET | `/teacher-sessions` | Yes (admin/teacher) | Teacher login/logout session history |
| GET | `/audit-log` | Yes (admin) | Paginated audit log; supports `?actor_id=` and `?action=` filters |
| POST | `/notifications` | Yes (admin) | Create school-wide notification |
| GET | `/notifications` | Yes | Get notifications for user's school |
| DELETE | `/notifications/:id` | Yes (admin) | Delete a notification |

### Users — `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/invite-teacher` | Yes (admin) | Invite teacher by email → sends credentials |
| POST | `/add-student` | Yes | Add single student to a class |
| POST | `/bulk-students` | Yes | Bulk add students (max 500 per batch) |
| POST | `/bulk-teachers` | Yes (admin) | Bulk invite teachers from array |
| PATCH | `/profile` | Yes | Update own profile (name, phone, profile photo, language) |
| PATCH | `/teacher/:id` | Yes (admin) | Update teacher details (name, is_active) |
| PUT | `/teacher/:id/assignments` | Yes (admin) | Set teacher class/subject assignments |
| PATCH | `/student/:id` | Yes | Update student (name, class) |
| PATCH | `/bulk-gender` | Yes (admin) | Bulk set gender on a list of users |
| PATCH | `/bulk-assign-class` | Yes (admin) | Bulk assign students to a class |
| PATCH | `/bulk-transfer` | Yes (admin) | Bulk transfer students to another class |
| DELETE | `/bulk-delete` | Yes (admin) | Bulk soft-delete users (is_active = false) |
| DELETE | `/:id` | Yes | Soft-delete user (is_active = false) |

### Teacher — `/api/teacher`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/attendance` | Yes (teacher) | Save attendance {class_id, date, period, records[]}; rejects future dates |
| GET | `/attendance` | Yes | Get attendance for class+date+period |
| GET | `/attendance-stats` | Yes | Per-student + class-aggregate attendance % across 4 ranges |
| GET | `/attendance-range` | Yes | Per-student + class-aggregate stats for custom date range |
| GET | `/student-attendance` | Yes (student) | Student fetches own full attendance history |
| GET | `/class-students` | Yes (teacher) | Fetch students for any class in teacher's school |
| GET | `/my-class` | Yes (teacher) | Teacher's primary class details and students |
| GET | `/timetable` | Yes | Timetable for a class (by class_id query param) |
| PUT | `/timetable/:class_id` | Yes (teacher) | Save timetable slots (conflict detection enforced) |
| GET | `/my-classes` | Yes (teacher) | Classes this teacher teaches |
| GET | `/student-timetable` | Yes (student) | Student's class timetable |
| GET | `/notifications` | Yes | Notifications for current user |
| PATCH | `/notifications/read` | Yes | Mark specific notification as read |
| PATCH | `/notifications/read-all` | Yes | Mark all notifications as read |
| POST | `/notifications` | Yes (teacher) | Create/broadcast a notification to a class |
| GET | `/notifications/sent` | Yes (teacher) | List notifications sent by this teacher |
| DELETE | `/notifications/:id` | Yes (teacher) | Delete a notification |
| GET | `/student-progress` | Yes (teacher) | Per-student lesson progress across modules |
| GET | `/activity/week` | Yes (teacher) | Weekly activity data for a class |

### Student — `/api/student`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | Yes (student) | Aggregated stats, continue-learning, upcoming events |
| GET | `/quests` | Yes (student) | Active quest checklist |
| GET | `/classmates` | Yes (student) | Top 5 classmates by points |
| POST | `/activity/ping` | Yes (student) | Record login or item_viewed activity |
| POST | `/activity/clockout` | Yes (student) | Add session minutes to daily total |
| GET | `/teachers` | Yes (student) | List teachers in student's class |
| GET | `/attendance` | Yes (student) | Student's attendance records (date+period level) |
| GET | `/attendance/range` | Yes (student) | Student's attendance for a custom date range |

### Modules — `/api/modules`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/counts` | Yes | Module count per subject for a class |
| GET | `/` | Yes | Modules for class+subject (includes viewedItemIds for students) |
| POST | `/` | Yes (teacher) | Create module |
| PATCH | `/:id` | Yes (teacher) | Rename module |
| DELETE | `/:id` | Yes (teacher) | Delete module + GridFS files + progress |
| PUT | `/reorder` | Yes (teacher) | Reorder modules |
| POST | `/:id/items` | Yes (teacher) | Upload files (disk-based streaming, 200MB max, 10 files; magic-byte validated) or add link |
| PATCH | `/:id/items/:itemId` | Yes (teacher) | Rename item |
| DELETE | `/:id/items/:itemId` | Yes (teacher) | Delete item + GridFS chunks |
| PUT | `/:id/items/reorder` | Yes (teacher) | Reorder items |
| POST | `/:id/items/:itemId/viewed` | Yes (student) | Mark item as viewed (triggers progress update + points) |

### Quizzes — `/api/quizzes`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Students: class quizzes (no correct_index); Teachers: own quizzes |
| POST | `/` | Yes (teacher) | Create quiz with questions |
| PATCH | `/:id` | Yes (teacher) | Edit quiz (title, questions, is_active) |
| DELETE | `/:id` | Yes (teacher) | Delete quiz |
| POST | `/:id/submit` | Yes (student) | Submit answers → score (race-condition safe via upsert) |
| GET | `/:id/attempts` | Yes | Student's attempts for a quiz |
| GET | `/:id/results` | Yes (teacher) | All student results for a quiz |

### Challenges — `/api/challenges`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Students: class challenges with submitted flag; Teachers: own challenges |
| POST | `/` | Yes (teacher) | Create challenge |
| DELETE | `/:id` | Yes (teacher) | Delete challenge |
| POST | `/:id/submit` | Yes (student) | Submit code (upserts — re-submit overwrites before deadline) |
| GET | `/:id/submissions` | Yes (teacher) | All student submissions for a challenge |
| GET | `/my-submissions` | Yes (student) | Student's own submissions |

### Marks — `/api/marks`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes (teacher/admin) | All exams for a class (by class_id param) |
| POST | `/` | Yes (teacher) | Create exam definition (title, type, date, subjects, grade_scale) |
| DELETE | `/:id` | Yes (teacher) | Delete exam + all results |
| GET | `/:id/results` | Yes (teacher/admin) | All students' results for an exam |
| POST | `/:id/results` | Yes (teacher) | Bulk upsert marks — validates all student IDs belong to school before writing |
| GET | `/my-results` | Yes (student) | Student's own marks across all exams |
| GET | `/report-card/:studentId` | Yes (teacher/admin) | Generate PDF report card (via pdfWorker queue or sync fallback) |
| GET | `/my-report-card` | Yes (student) | Generate and download own PDF report card |

### Homework — `/api/homework`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Teachers: homework for a class (class_id param); Students: own class homework with submission status |
| POST | `/` | Yes (teacher) | Create homework (subject, title, description, due_date, class_id) |
| PATCH | `/:id` | Yes (teacher) | Edit homework (title, description, due_date, is_active) — only creator |
| DELETE | `/:id` | Yes (teacher) | Delete homework + all submissions — only creator |
| POST | `/:id/submit` | Yes (student) | Submit/update answer (upserts — re-submit overwrites) |
| GET | `/:id/submissions` | Yes (teacher/admin) | All student submissions for a homework with student names |
| PATCH | `/submissions/:subId` | Yes (teacher) | Give feedback and/or marks to a submission |
| GET | `/my-submissions` | Yes (student) | Student's own submissions enriched with homework info |

### DPDP — `/api/dpdp`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/deletion-request` | Yes | Submit data deletion request (DPDP Act 2023); 409 if pending request exists |
| GET | `/deletion-requests` | Yes (admin) | List all deletion requests for school |
| PATCH | `/deletion-requests/:id` | Yes (admin) | Approve (soft-deactivates user) or reject request |

### Parent — `/api/parent`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/child` | Yes (parent) | Linked child's profile, class, teacher info |
| GET | `/child/attendance` | Yes (parent) | Child's attendance records |
| GET | `/child/progress` | Yes (parent) | Child's lesson progress across all modules |
| GET | `/child/marks` | Yes (parent) | Child's exam results |
| GET | `/child/certificates` | Yes (parent) | Child's issued certificates |

### AI — `/api/ai`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/lesson-assist` | Yes (teacher, starter+ plan) | {question, context?, language?} → Claude response; 402 for free-plan schools; 30 req/min per user via Redis sliding window (LRU fallback) |

### Certificates — `/api/certificates`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes (admin) | All issued certificates for school |
| GET | `/template` | Yes | Get school's certificate template (auto-creates default if none) |
| POST | `/template` | Yes (teacher/admin) | Save certificate template settings |
| POST | `/template/logo` | Yes (teacher/admin) | Upload school logo (max 5MB, stored in GridFS) |
| DELETE | `/template/logo` | Yes (teacher/admin) | Remove school logo |
| GET | `/download/:id` | Yes | Download/view certificate PDF (?inline=1 to open in browser) |
| GET | `/class/:classId/module/:moduleId` | Yes (teacher/admin) | List certs for a specific class + module |
| GET | `/class/:classId` | Yes (teacher/admin) | All certs for a class grouped by module |
| POST | `/bulk-generate` | Yes (teacher/admin) | Download ZIP of all certs for class+module |
| POST | `/preview` | Yes (teacher/admin) | Preview PDF using current template + sample data |
| POST | `/custom-issue` | Yes (teacher/admin) | Issue custom certificates to one or more students |
| DELETE | `/:id` | Yes (teacher/admin) | Revoke a custom certificate |

### Student Certificates — `/api/student-certificates`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/eligible` | Yes (student) | Modules ≥70% complete, not yet claimed |
| POST | `/claim` | Yes (student) | Claim certificate for module (race-condition safe) |
| GET | `/my` | Yes (student) | All student's certificates |
| GET | `/mine` | Yes (student) | Alias for /my |
| GET | `/download/:id` | Yes (student) | Download certificate as PDF |

### Files — `/api/files`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/token` | Yes | Issue short-lived TTL-protected file access token |
| GET | `/:token` | No (token in path) | Stream GridFS file using token |

### Run — `/api/run`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Yes | Execute code via Piston API sandbox (python/javascript/html); returns {output, stderr}; 503 if PISTON_URL not configured; rate limited 20/min |

### Reports — `/api/reports`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/activity-pdf` | Yes (teacher) | Generate Puppeteer PDF of lesson activity report |
| GET | `/compliance` | Yes (admin/teacher) | Generate board compliance report PDF |

### Payments — `/api/payments`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/order` | Yes | Create Razorpay order |
| POST | `/webhook` | No (HMAC signature) | Razorpay payment webhook — raw body required before JSON parser |

### WhatsApp — `/api/whatsapp`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/send` | Yes (teacher/admin) | Send WhatsApp notification to a user or class |

### Health — (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Simple liveness check — returns `{ status: "ok" }` |
| GET | `/health/detailed` | MongoDB state, Redis ping, Puppeteer status, BullMQ queue depths, memory usage |

---

## 7. Frontend Architecture

### Routing (`frontend/src/App.tsx`)
```
/                       → HomePage
/pricing                → PricingPage
/signup                 → SignupPage
/login                  → LoginPage
/for-schools            → ForSchoolsPage
/for-teachers           → ForTeachersPage
/forgot-password        → ForgotPasswordPage
/set-password           → SetPasswordPage
/legal/:type            → LegalPage
/student/dashboard      → RequireAuth(role="student") → lazy(StudentDashboard)
/teacher/dashboard      → RequireAuth(role="teacher") → lazy(TeacherDashboard)
/admin/dashboard        → RequireAuth(role="admin")   → lazy(AdminDashboard)
/parent/dashboard       → RequireAuth(role="parent")  → lazy(ParentDashboard)
/*                      → NotFoundPage
```

`RequireAuth` reads `useAuth()`. If not authenticated → redirects to `/login` (passes `?redirect=` param so user returns to their destination after login). If `must_change_password === true` → redirects to `/set-password` before anything else.

All four dashboard imports use `React.lazy()` — each dashboard bundle is only loaded when the user navigates to that role's route.

### Auth Flow (`frontend/src/contexts/AuthContext.tsx`)
1. On mount, calls `getCurrentUser()` → `GET /api/auth/me`
2. If 401 → user is null (not logged in)
3. `signIn()` → calls `frontend/src/lib/auth.ts` → sets `ts_token` httpOnly cookie → calls `setUserFromLogin(user)` to skip GET /me refetch
4. `signOut()` → `await authSignOut()` → `POST /api/auth/signout` (increments token_version on server) → clears state, redirects to `/login`; clears localStorage keys matching `ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*`
5. Cross-tab logout via two mechanisms:
   - `BroadcastChannel.postMessage("signout")` — works in Chrome/Firefox
   - `localStorage.setItem("ts_logout_signal", timestamp)` then immediate remove — triggers `storage` event in Safari <15.4 and iOS WKWebView
6. Auth state is NEVER stored in localStorage — only in the `ts_token` httpOnly cookie

### DashboardLayout — NAV_SECTIONS Whitelist
`DashboardLayout.tsx` has a `NAV_SECTIONS` object per role. A nav item in a dashboard's `NAV_ITEMS` array will only appear in the sidebar if its label ALSO exists in `NAV_SECTIONS` for that role. Always update BOTH when adding a new nav item.

Current sections:
```
student:  Overview (Dashboard, Lessons, Timetable)
          Activities (Quizzes, Homework, Certificates, My attendance, My Marks, Live Code)
          School (Teachers)
          Account (Settings)

teacher:  Overview (Dashboard, Lessons, Timetable, Live Code)
          Management (Attendance, Students, Quizzes, Homework, Marks, Certificates)
          Communicate (AI assistant, Notifications)
          Account (Settings)

admin:    School (Overview, Classes, Timetable)
          People (Teachers, Students)
          Manage (Marks, Certificates, Reports, Data Requests)
          Communicate (Notifications)
          Account (Settings)
```

### View Switching (Dashboard pages)
All three dashboards are single-component files with a `view` state. Navigation items call `setView("view-name")` via `VIEW_MAP`. Heavy sub-views are extracted into panel components under `components/admin/`, `components/teacher/`, `components/student/`.
```tsx
const VIEW_MAP = { "Dashboard": "dashboard", "Homework": "homework", ... }
// Nav click → setView(VIEW_MAP[item.label])
// Render: {view === "homework" && <TeacherHomeworkPanel ... />}
// Heavy panels are named exports from components/teacher/TeacherHomeworkPanel.tsx etc.
```

### PWA Update Flow
`PWAUpdateBanner.tsx` is mounted in `App.tsx`. When Vite's service worker detects a new build, the banner appears — the user clicks "Update now" to reload. Updates never happen automatically mid-session.

### API Call Pattern
```ts
async function getHomework(classId: string) {
  return apiFetch<{ homework: HomeworkItem[] }>(`/api/homework?class_id=${classId}`)
}
// apiFetch (all 7 lib files): adds VITE_BACKEND_URL, sends credentials: "include" for cookie auth
// Includes: 30-second AbortController timeout, X-Request-ID (UUID per call) sent as header
// Returns { error: string, requestId?: string } on failure, typed data on success
// Callers: always check if ("error" in res) before using data
```

### State Management
- No Redux or Zustand — all state is local `useState` + `useEffect` in each page component
- Lazy loading: data fetched only when the relevant view is first opened
- Pattern:
  ```ts
  const [data, setData] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (view !== "target" || loaded) return
    fetchData().then(res => { if (!("error" in res)) setData(res.data); setLoaded(true) })
  }, [view, loaded])
  ```

### Theme
- ThemeProvider wraps everything in App.tsx
- Key: `teachscript-theme`, values: `light` | `dark`
- CSS variables: `--foreground`, `--background`, `--muted`, `--border`, etc.
- Brand colors: primary purple `#534AB7`, blue `#378ADD`, green `#639922`

---

## 8. Security Architecture

### Rate Limits (per IP unless noted)
| Endpoint | Limit |
|----------|-------|
| All `/api/*` | 300 req/min |
| `/api/auth/signin` | 5 attempts / 15 min (brute-force protection) |
| `/api/auth/forgot-password` | 5 / 15 min |
| `/api/auth/reset-password` | 5 / 15 min |
| `/api/auth/verify-otp` | 10 / 15 min |
| `/api/auth/send-sms-otp` | 5 / 15 min |
| `/api/auth/verify-sms-otp` | 10 / 15 min |
| `/api/signup/request` | 5 / 15 min |
| `/api/ai/*` | 30 req/min **per user** (LRU keyed on userId, not IP) |
| `/api/certificates/*` | 20 req/min |
| `/api/reports/*` | 20 req/min |
| `/api/run` | 20 req/min |
| `/api/users/*` | 60 req/min |

### Security Headers (Helmet + nginx)
- CSP (API backend via Helmet): `defaultSrc 'self'`, `scriptSrc 'self'`, `objectSrc 'none'`, `frameAncestors 'none'`
- CSP (nginx — frontend): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.teachscript.in; media-src 'self' blob:; frame-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';`
- HSTS: max-age 31536000, includeSubDomains
- Referrer-Policy: strict-origin-when-cross-origin
- Frameguard: SAMEORIGIN
- X-Request-ID: echoed back in every API response — frontend can surface to users in error states

### Auth & Data Isolation
- JWT stored in `ts_token` httpOnly cookie — never localStorage
- JWT expiry is role-based: **8 hours** for admin/teacher, **1 day** for student/parent
- JWT role is re-read from DB every **30 seconds** (cached in `middleware/auth.ts` via Redis if available, otherwise in-process Map) — role claim in JWT payload is intentionally ignored to prevent role escalation
- **Token revocation**: `token_version` field on User — signout increments it; middleware rejects any JWT where `tv` claim < DB `token_version`; stale tokens invalid immediately (no 8-hour window for abuse)
- Every route verifies `user.school_id` matches the resource's `school_id` — cross-school data access is impossible
- **Subscription enforcement**: `requirePlan()` middleware from `lib/planGate.ts` gates features by plan tier; returns 402 with `{error, current_plan, required_plans}` — AI assistant requires starter+ plan
- Passwords: bcrypt with **12 rounds**; input capped at 128 chars (bcrypt DoS protection); zxcvbn score < 2 rejected on set/change/reset routes
- `password_hash` is never returned by any route — always excluded from `.select()`
- OTP generation uses `crypto.randomBytes(3)` — cryptographically secure, not `Math.random()`
- OTP TOCTOU fixed: mark-used + increment applied atomically via single MongoDB aggregation pipeline update (no separate read-then-write)
- Attendance cannot be marked for future dates (IST timezone enforced on backend; `TZ=Asia/Kolkata` in docker-compose)
- Student points use `$max` operator — cannot decrease once set
- File uploads validated by magic bytes (`file-type` package) — not just Content-Type header
- GridFS school boundary fail-closed: `metadata.school_id` must match user's school; missing metadata → 403 (not skipped)
- File token consumption atomic via `findOneAndDelete` — no race condition on concurrent download clicks
- Bulk marks upsert validates all student IDs belong to the school before writing anything
- Rate limiters see real client IP via `app.set("trust proxy", 1)` (nginx X-Forwarded-For)
- CORS: `ALLOWED_ORIGINS` env var allows multi-domain deployments; falls back to `FRONTEND_URL` for single-origin
- localStorage cleared on signout (`ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*`) — no PII persists after logout
- Cross-tab logout: BroadcastChannel + localStorage storage event (Safari <15.4 / iOS WKWebView fallback)
- Open redirect prevented: login `?redirect=` param validated with URL origin-pinning (`new URL(param, window.location.href).origin === window.location.origin`)
- /metrics endpoint restricted to private IPs via CIDR-correct `isPrivateIp()` — fixes prior bug where `172.2xx.x.x` (public) was incorrectly allowed
- **SAST**: eslint-plugin-security runs in CI on every push — catches unsafe-regex, pseudoRandomBytes, buffer misuse, prototype pollution

### DPDP Act 2023 (India Data Privacy)
- Consent checkbox on school signup (final step)
- Privacy notice shown on every login page ("By signing in you accept our Privacy Policy — DPDP Act 2023")
- Users can request data deletion from Settings — creates `DataDeletionRequest` record
- Admin reviews requests: approve soft-deactivates the user (`is_active: false`), reject closes it
- All requests scoped to school — admin can only see their school's requests
- **AuditLog**: every approve/reject decision and every bulk marks entry is written to `AuditLog` — 2-year retention (auto-deleted by TTL index for data minimisation); queryable via `GET /api/school/audit-log`

---

## 9. Coding Conventions

### Always Do
- **Check API errors**: `if ("error" in res) { showError(res.error); return }` before using data
- **School boundary**: every backend route must verify `user.school_id === resource.school_id`
- **Select fields explicitly**: `.select("field1 field2")` — never return full user docs
- **Use `lean()`**: always on Mongoose queries for plain objects (faster, no Mongoose overhead)
- **Role check first**: validate role at the top of every route handler before any DB work
- **Upsert re-submissions**: use `findOneAndUpdate(..., { upsert: true })` — never `create()` for homework/challenge/quiz submissions
- **Attendance rate formula**: `(present + late × 0.5) / total × 100`
- **Validate ObjectIds**: use `validateObjectId(id)` from `lib/validateId.ts` before any ObjectId conversion — invalid IDs throw a clean 400, not a 500
- **Validate student ownership on bulk writes**: when bulk-upserting marks/results for a list of student IDs, verify ALL student IDs belong to the correct school before writing anything
- **Use pino logger**: `import { logger } from "../lib/logger.js"` — never use `console.log/error/warn` in backend code
- **Use GridFS helper**: `import { getGridFSBucket } from "../lib/gridfs.js"` — never redefine `getGridFSBucket()` locally
- **Use withRetry for flaky ops**: wrap external calls (email, SMS) with `withRetry()` from `lib/retry.ts`
- **PDF generation**: use `sendReportCardPdf()` helper in marks.ts (queue path + sync fallback) — never call `renderHtmlToPdf()` directly from routes
- **PDF template substitution**: call `assertReplaced(html, placeholder, context)` after every `.replace()` on a template string — throws immediately if a placeholder was not found, preventing silent empty fields
- **Code execution**: all code runs via the Piston API (`PISTON_URL`), never via `spawn("python3")` or any direct process execution
- **shadcn Button**: use `<Button>` from `@/components/ui/button` — not raw `<button>` for action buttons
- **Tailwind classes only**: no inline `style` for static colors; use inline style only for dynamic hex values
- **TypeScript everywhere**: no `.js` files in `src/` — all `.ts` or `.tsx`
- **`credentials: "include"`**: every `fetch()` call must include this for cookie auth
- **Soft-delete only**: never hard-delete users — always `is_active: false`
- **Cascade on class delete**: deleting a class must also delete its modules, quizzes, challenges, and related progress
- **Models in `models/` only**: all Mongoose schemas must live in `backend/src/models/` — never define schemas inline in route files
- **Await sign-out**: always `await authSignOut()` — fire-and-forget sign-out leaves valid cookies on the server
- **Cross-tab logout**: `BroadcastChannel.postMessage("signout")` must be called when signing out
- **Clear localStorage on signout**: remove all `ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*` keys — PII must not persist after logout
- **SMS delivery via lib/sms.ts**: call `sendSms(phone, otp, userName)` — never inline SMS delivery in route files
- **Password strength**: enforce `zxcvbn(password).score >= 2` on all set/change/reset flows (both client and server)
- **AbortController on all fetches**: all internal `apiFetch()` helpers have a 30-second abort timer — never omit it
- **X-Request-ID on all fetches**: send `X-Request-ID` header (UUID per call) so backend logs correlate with frontend error displays
- **Validate redirect URLs**: use origin-pinning (`new URL(param, window.location.href).origin === window.location.origin`) before following any redirect param — never blindly follow user-supplied URLs
- **Use ALLOWED_ORIGINS env var**: when adding a new allowed CORS origin, add it to `ALLOWED_ORIGINS` in `.env` — never hardcode in code
- **Plan gate on paid features**: wrap premium routes with `requirePlan("starter","standard","premium")` from `lib/planGate.ts` — never inline subscription checks in route handlers
- **Write AuditLog on sensitive mutations**: bulk marks entry and DPDP decisions must write an AuditLog record; failure to write must log but NOT fail the response
- **Use Mongoose aggregation pipeline updates with `{ updatePipeline: true }`**: when passing an array as the update argument to `updateOne()`, always include the option — omitting it throws `MongooseError: Cannot pass an array to query updates`
- **Batch report card queries**: use `fetchReportCardDataBatch()` from `services/reportCard.ts` for bulk PDF generation — never call `fetchReportCardData()` in a loop
- **Storage quota before upload**: call `checkStorageQuota(schoolId, additionalBytes)` before writing to GridFS; return 413 if exceeded; decrement on delete using `$max: [0, $subtract]` pipeline
- **Increment token_version on sensitive auth events**: signout already does this; any future password-change or role-change route should also increment it

### Never Do
- **Never return `password_hash`** from any route
- **Never skip school boundary checks** — school A data must never be readable by school B
- **Never use `ChallengeSubmission.create()`** for re-submissions — use `findOneAndUpdate` with upsert
- **Never store auth state in localStorage** — use the `ts_token` httpOnly cookie
- **Never mark attendance for future dates**
- **Never decrease student points** — use `$max` operator
- **Never launch a new Puppeteer browser per request** — use `getBrowser()` singleton from `lib/pdf.ts`
- **Never use `any` in TypeScript** — use `unknown` + narrow, or define proper interfaces
- **Never cast with `as never` or `as unknown as`** — define a proper TypeScript interface for the lean result shape instead
- **Never put large logic in JSX** — extract computed values above the `return` statement
- **Never add nav items without updating both** the dashboard's `NAV_ITEMS` AND `DashboardLayout.tsx`'s `NAV_SECTIONS`
- **Never duplicate large HTML template strings** — extract shared builder functions (`buildReportCardHTML` in marks.ts is the canonical shared helper)
- **Never trust `Content-Type` header alone for file uploads** — always validate actual file bytes with `file-type` magic-byte checking
- **Never call `console.log/error/warn` in backend** — use the pino `logger` from `lib/logger.ts`
- **Never redefine `getGridFSBucket()`** in individual route files — import from `lib/gridfs.ts`
- **Never trust JWT role claim** — middleware re-reads role from DB (cached 30s) and the JWT claim is ignored
- **Never use `ip.startsWith("172.2")` for private IP detection** — use `isPrivateIp()` from index.ts which correctly covers 172.16.0.0/12 only
- **Never leave localStorage PII after logout** — always call the localStorage cleanup in `AuthContext.handleSignOut`
- **Never inline SMS delivery in route files** — use `sendSms()` from `lib/sms.ts`
- **Never follow redirect params blindly** — always validate origin before redirecting to a user-supplied URL
- **Never skip plan gate on premium features** — free-plan schools must get 402, not a degraded experience or silent success
- **Never use `MongoMemoryServer` for tests that use transactions** — use `MongoMemoryReplSet` (replica set required for multi-document transactions)
- **Never trust GridFS files without school boundary** — missing `metadata.school_id` must fail closed (403), not be skipped

### File Conventions
- Dashboard files contain view routing logic and mount panel components from `components/{role}/`; heavy panels (> ~150 lines) live in their own component files
- API lib functions live in `frontend/src/lib/` — never `fetch()` directly from components
- Backend routes: one file per domain concern
- Model files: export both the Mongoose model AND the TypeScript interface (`IUser`, `IHomework`, etc.)
- Use `mongoose.models.Foo ?? mongoose.model(...)` pattern to avoid model re-registration errors
- GridFS bucket helper lives in `backend/src/lib/gridfs.ts` — do not redefine `getGridFSBucket()` in individual route files
- BullMQ queue helpers live in `backend/src/jobs/queue.ts` — never create raw Queue instances outside this file

---

## 10. Build and Run Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # Dev server → http://localhost:5173
npm run build        # Production build → frontend/dist/
npm run preview      # Preview production build
npx tsc --noEmit    # Type check only (must return 0 errors before any commit)
```

### Backend
```bash
cd backend
npm install
npm run dev          # Dev server with hot reload → http://localhost:4000
                     # = tsx watch --env-file=.env src/index.ts
npm run build        # TypeScript → dist/
npm run start        # Production: node --env-file=.env dist/index.js
npm run test         # Vitest unit tests
npx tsc --noEmit    # Type check only (must return 0 errors before any commit)
```

### E2E Tests
```bash
# From project root
npx playwright install   # First time only — installs browser binaries
npx playwright test      # Headless E2E run (requires both servers running)
npx playwright test --ui # Interactive UI mode
```

### Docker (production)
```bash
# From project root
docker-compose up -d     # Starts all 6 services (MongoDB replica set + Redis + backend + nginx)
docker-compose down      # Stop all services
```

### Required `.env` — Backend (`backend/.env`)
```
MONGODB_URI=mongodb://localhost:27017/teachscript
JWT_SECRET=<min 32 chars, random — server refuses to start if too short>
FRONTEND_URL=http://localhost:5173
ANTHROPIC_API_KEY=sk-ant-...
BACKEND_URL=http://localhost:4000
APPROVAL_SECRET=<hmac secret for signup approval links>
RESEND_API_KEY=re_...          # Email delivery via Resend
FROM_EMAIL=onboarding@resend.dev
OWNER_EMAIL=admin@yourschool.com
RAZORPAY_KEY_ID=rzp_...        # Payments (optional)
RAZORPAY_KEY_SECRET=...        # Payments (optional)
WHATSAPP_API_TOKEN=...         # WhatsApp Business API (optional)
WHATSAPP_PHONE_NUMBER_ID=...   # WhatsApp (optional)
REDIS_URL=redis://localhost:6379   # Optional — distributed auth cache + BullMQ queues
PISTON_URL=http://piston:2000      # Optional — code execution sandbox (Docker); returns 503 if not set
ALLOWED_ORIGINS=https://app.teachscript.in,https://staging.teachscript.in  # Optional — multi-domain CORS; falls back to FRONTEND_URL
FAST2SMS_API_KEY=...           # Optional — SMS OTP delivery (Fast2SMS, recommended for India)
TWILIO_ACCOUNT_SID=...         # Optional — SMS OTP delivery (Twilio, fallback)
TWILIO_AUTH_TOKEN=...          # Optional — SMS OTP delivery (Twilio)
TWILIO_FROM_NUMBER=...         # Optional — SMS OTP delivery (Twilio)
MONGO_INITDB_ROOT_USERNAME=...  # Required in production Docker — MongoDB auth
MONGO_INITDB_ROOT_PASSWORD=...  # Required in production Docker — MongoDB auth
BACKUP_S3_BUCKET=...            # Optional — daily mongodump S3 sync target (docker-compose mongo-backup sidecar)
# SENTRY_DSN=https://...       # Optional — error tracking via Sentry
# LOG_LEVEL=info               # Optional — pino log level (default: debug in dev, info in prod)
NODE_ENV=development
```

### Required `.env` — Frontend (`frontend/.env`)
```
VITE_BACKEND_URL=http://localhost:4000
```

### Docker (production)
`docker-compose.yml` runs 6 services:
- **mongo:7** — replica set (rs0, required for transactions), auth enabled (`MONGO_INITDB_ROOT_USERNAME/PASSWORD`)
- **mongo-init** — one-shot `rs.initiate()` sidecar
- **mongo-backup** — daily `mongodump` at 02:00 IST, 7-day local retention, optional S3 sync (`BACKUP_S3_BUCKET`)
- **redis:7** — AOF persistence (`--appendonly yes`), health check
- **backend** — Node.js app, `TZ=Asia/Kolkata` env var (IST for attendance/midnight-clockout), health check (`/health/detailed`)
- **nginx:1.27** — TLS termination, routes `/api/*` → backend, `/*` → frontend; full CSP header set

All services use JSON log drivers with per-file size limits to prevent disk exhaustion.

### CI Pipeline (`.github/workflows/ci.yml`)
On every push and pull request to **any branch** — three jobs run in order:
1. **unit** — Type-check both packages (`npx tsc --noEmit`), run `npm audit --audit-level=high` (fails on high/critical CVEs), **SAST** (eslint-plugin-security on backend src/, `--max-warnings 30`), run backend Vitest unit tests + frontend tests
2. **trivy** (needs: unit) — Builds the backend Docker image and scans it with Trivy for CRITICAL/HIGH unpatched vulnerabilities; fails the build if any are found
3. **e2e** (needs: unit) — Starts MongoDB as a **replica set** (`--replSet rs0` + `rs.initiate()`), builds + starts backend and frontend dev server, runs Playwright E2E suite; uploads report artifact on failure

---

## 11. Feature Implementation Order

When adding any new feature, always follow this sequence:

### Step 1 — Model (`backend/src/models/`)
Define Mongoose schema + TypeScript interface. Add proper indices. Export using `mongoose.models.Foo ?? mongoose.model(...)` to prevent re-registration.

### Step 2 — Route (`backend/src/routes/`)
Add route handler (or create new file). Always:
- Call `requireAuth` middleware first
- Check `user.role` at top of handler
- Verify `school_id` boundary on every query
- Use `validateObjectId(id)` from `lib/validateId.ts` before any ObjectId conversion
- Use `.select()` and `.lean()`
- Return `{ error: string }` on failure, typed data on success
- Register the router in `backend/src/index.ts`
- Log errors with `req.log?.error({ err }, "description")` — never `console.error`

### Step 3 — API Lib (`frontend/src/lib/`)
Add typed function in the appropriate lib file. Use `apiFetch()`. Define return type as `Data | { error: string }`.

### Step 4 — Component / Page (`frontend/src/pages/`)
Add view inside the relevant dashboard file:
- Add new value to the `View` type union
- Add entry to `VIEW_MAP`
- Add item to `NAV_ITEMS`
- Add label to `DashboardLayout.tsx` `NAV_SECTIONS` for the correct role
- Use lazy loading pattern (`loaded` state + `useEffect` guard)
- Always check `"error" in res` before using API data
- For heavy panels (> ~150 lines): extract into `components/{role}/PanelName.tsx`

### Step 5 — TypeScript Check
```bash
npx tsc --noEmit   # in both frontend/ and backend/ — must return 0 errors
```

### Step 6 — Unit Tests
Add a test file in `backend/src/tests/` for any new route logic that has edge cases (validation, formulas, access control). Use the `helpers.ts` factories and `MongoMemoryReplSet` (not `MongoMemoryServer` — replica set is required for transaction support). Use `createClass()` without hardcoding grade/section to avoid unique index collisions across tests.

### Step 7 — Playwright Test

**NEVER write a one-off `.mjs` script in the project root.** Always add tests to the dedicated `e2e/` folder.

1. Verify `http://localhost:4000/api/auth/me` returns 401
2. Verify `http://localhost:5173` returns 200
3. **Add test cases to the appropriate existing spec** in `e2e/` (e.g. auth.spec.ts, homework.spec.ts) OR create `e2e/feature-name.spec.ts` for a new feature area. Never write throwaway `.mjs` scripts.
4. Reuse the `login()` helper already defined in `e2e/auth.spec.ts` — import or copy it. Never inject cookies.
5. Run with: `npx playwright test e2e/feature-name.spec.ts --headed --project=chromium` (or the specific file). `playwright.config.ts` has `headless: true` by default — pass `--headed` for local Phase 5 runs so you can see the browser.
6. Take screenshots inside the spec with `await page.screenshot({ path: "ss_name.png" })` at every major step — read and verify each one inline in Phase 5 output. Delete all `ss_*.png` files after Phase 5 passes.
7. Test negative cases and regression cases
8. After Phase 5 passes: **keep the spec file permanently** — it becomes part of the CI E2E suite. Never delete spec files. Only delete screenshots.

**Reusable login credentials** (defined once here, referenced in all specs):
```ts
const STUDENT = { identifier: "5c4",                         password: "TS@GHZg5b8",   role: "student" as const }
const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234", role: "teacher" as const }
const ADMIN   = { identifier: "ksn1203003@gmail.com",         password: "Admin@1234",   role: "admin"   as const }
```

---

## 12. Pending Work

All security, reliability, performance, code quality, and DevOps engineering items have been implemented across four audit cycles. Two operational items remain — they require external registration before going live.

### Operational Gaps (Code Complete — Provider Setup Needed)

| Priority | ID | Item | Blocker |
|----------|----|------|---------|
| P2 | C-27 / C-34 | SMS 2FA + SMS passwordless login | `lib/sms.ts` implemented. Set `FAST2SMS_API_KEY` (recommended for India) or Twilio env vars. Remaining: DLT-registered sender ID + SMS template with telecom operator (TRAI requirement — 24–48 h). |
| P3 | — | AuditLog admin UI | `GET /api/school/audit-log` endpoint exists and is fully functional. Remaining: build an admin panel component to display the log with actor/action filters and pagination. No backend work needed. |

### Completed in the fourth engineering audit (June 2026)
- JWT token revocation via `token_version` field on User — signout increments it; middleware rejects stale JWTs instantly
- Redis sliding-window AI rate limiter (per-user, cross-process) — replaces per-process LRU; LRU remains as Redis fallback
- Parent route school-boundary guards — cross-school child access prevented on all 5 parent endpoints
- Module items capped at 200 via Mongoose validator — prevents MongoDB BSON 16MB document limit being hit
- Docker-compose hardening — MongoDB `--auth`, Redis AOF, daily `mongodump` backup sidecar, JSON log drivers with size limits
- CI E2E MongoDB replica set — `--replSet rs0` + `rs.initiate()` step; multi-document transactions now tested correctly
- Unit test replica set — `MongoMemoryReplSet` replaces `MongoMemoryServer` in `tests/helpers.ts`
- Homework concurrent upsert test — 5 simultaneous submissions verify exactly 1 DB document
- Quiz test fixes — route names, response shapes, concurrent submit, `max_attempts` handling
- New E2E spec `e2e/lessons.spec.ts` — 7 end-to-end tests (teacher/student lessons flow, file token auth, AI auth, health endpoint)
- Fast2SMS response checking — throws if `!smsRes.ok` so `withRetry` retries on delivery failure

### Completed in the fifth engineering audit (June 2026) — Groups A–H
- **Group A** — Model validation: `Attendance.period` min:1 max:8; `Homework.description` maxlength:2000; `Quiz.questions` validator (1–100); Quiz toJSON strips `correct_index` unconditionally; `School.storage_used_bytes` + `PLAN_STORAGE_QUOTAS` + `PLAN_ORDER` constants
- **Group B** — Safari cross-tab logout: `localStorage storage` event listener added to `AuthContext.tsx` alongside BroadcastChannel — covers Safari <15.4 and iOS WKWebView
- **Group C** — Timezone hardening: `TZ=Asia/Kolkata` added to backend service in `docker-compose.yml` — makes midnight clock-out and IST date comparisons correct in all environments
- **Group D** — GridFS school boundary: `scripts/migrateFileMetadata.ts` migration script; `routes/files.ts` school boundary check now mandatory (fail-closed); missing `metadata.school_id` → 403
- **Group E** — Report card query batching: `fetchReportCardDataBatch()` added to `services/reportCard.ts` — reduces N×5 DB round-trips to ~5 for bulk PDF generation via `$in` queries
- **Group F** — Storage quota + plan gates + AuditLog: `lib/planGate.ts` middleware; `models/AuditLog.ts` (2-year TTL); quota check + `$inc`/`$max(0,$subtract)` in `routes/modules.ts`; `requirePlan` gate on `routes/ai.ts`; AuditLog writes in `routes/dpdp.ts` and `routes/marks.ts`; `GET /api/school/audit-log` in `routes/school.ts`
- **Group G** — Test coverage: `planGate.test.ts` (4), `storageQuota.test.ts` (5), `auditLog.test.ts` (4); `helpers.ts createClass()` randomised section; `ai.test.ts` updated for plan gate — 15 test files, ~111 tests total
- **Group H** — SAST + CI: eslint-plugin-security added to CI unit job; CI branches changed from `["main","master","develop"]` to `["**"]` to cover all PRs

### Completed in the third engineering audit (June 2026)
- Content-Security-Policy header added to `nginx/nginx.conf` — covers frontend static files (was missing, P0)
- localStorage PII cleanup on signout — `ts_avatar_*`, `ts_clock_*`, `teachscript_avatar_*` keys removed in `AuthContext.handleSignOut` (P0)
- Open redirect fixed in `LoginPage.tsx` — `?redirect=` param validated via URL origin-pinning before use (P0)
- OTP TOCTOU race fixed in `routes/auth.ts` — atomic MongoDB aggregation pipeline update replaces separate find + update (P0)
- AbortController + X-Request-ID added to all 7 frontend API lib files (userApi, studentApi, moduleApi, marksApi, homeworkApi, dpdpApi, parentApi) (P1)
- `lib/sms.ts` created — SMS delivery abstraction (Fast2SMS + Twilio) mirroring `lib/email.ts`; extracted from inline auth.ts code (P1)
- zxcvbn password strength enforcement — score < 2 rejected on set/change/reset flows, client-side meter in `SetPasswordPage.tsx` (P1)
- `warmOutstandingTemplate()` exported from `lib/pdf.ts` and called at server startup to pre-warm certificate image cache (P1)
- ALLOWED_ORIGINS CORS — multi-domain support via comma-separated env var in `index.ts` (P1)
- X-Request-ID echoed in all API responses via middleware in `index.ts` (P1)
- `isPrivateIp()` CIDR bug fixed — `172.2xx.x.x` public IPs no longer incorrectly match the 172.16.0.0/12 private range (P2)
- BullMQ worker drain on shutdown — SIGTERM waits for workers to finish before exit; graceful drain replaces forced kill (P2)
- `validateEnv()` uses structured pino logger instead of `console.warn` (P2)

### Completed in the second engineering audit (June 2026)
- Homework deadline enforcement — student cannot submit after `due_date` (`routes/homework.ts`)
- Homework feedback ownership check — teacher can only give feedback on their own assignments (`routes/homework.ts`)
- Challenge language stored from challenge definition, not request body (`routes/challenges.ts`)
- Challenge DELETE school boundary check before ownership — cross-school probe returns 404 not 403 (`routes/challenges.ts`)
- File token consumption made atomic via `findOneAndDelete` — prevents race condition on concurrent requests (`routes/files.ts`)
- Parent attendance route replaced full-collection scan with targeted aggregation pipeline (`routes/parent.ts`)
- BullMQ queue depth added to `/health/detailed` response (`index.ts`)
- LibreOffice availability check at `pptxWorker` startup — logs warning immediately if absent (`jobs/pptxWorker.ts`)
- `buildReportCardHTML` extracted to `lib/reportCardTemplate.ts` — independently testable, no duplication (`routes/marks.ts`)
- Unified email delivery abstraction in `lib/email.ts` — Resend → Nodemailer/Gmail fallback; `nodemailer` removed from `auth.ts`, `signup.ts`, `users.ts`
- Four new test files: `challenges.test.ts` (6 cases), `files.test.ts` (3 cases including atomic race test), `homework.test.ts` additions (deadline + ownership), `certificates.test.ts` additions (66% boundary, 100% success)
- Frontend: `credentials: "include"` added to activity-PDF and AI-assistant fetch calls in `TeacherDashboard.tsx`
- Frontend: `.catch(console.error)` replaced with `.catch(() => {})` in blob viewer error handlers (`TeacherDashboard.tsx`, `StudentDashboard.tsx`)

### Completed in the first engineering audit (June 2026)
- Piston API sandbox replacing unsafe Python `spawn` in `routes/run.ts`
- `app.set("trust proxy", 1)` so rate limiters see real IPs behind nginx
- Crypto-secure OTP via `randomBytes` replacing `Math.random` in `routes/auth.ts`
- Role-based JWT expiry (admin/teacher = 8h, student/parent = 1d)
- `link_url` schema validation (must start with `http://` or `https://`) in `models/Module.ts`
- Attendance DB query fix in `routes/marks.ts` (filter at DB level, leverages compound index)
- HTTP Range (206) support for video seeking in `routes/files.ts`
- New compound index `{module_id, student_id}` on `ModuleProgress`
- Shared `fetchReportCardData()` service extracted to `services/reportCard.ts`
- `assertReplaced()` post-substitution guard in `lib/pdf.ts`
- SIGTERM/SIGINT handler in `jobs/pptxWorker.ts` killing active LibreOffice child processes
- SMS OTP delivery wrapped in `withRetry` (3 attempts, 500ms base)
- Vitest coverage thresholds raised to lines: 70, functions: 70, branches: 65
- Four new test files: `modules.test.ts`, `quizzes.test.ts`, `certificates.test.ts`, `ai.test.ts`
- `npm audit` gate (high/critical) + Trivy Docker scan added to CI pipeline
