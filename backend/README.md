# TeachScript Backend

Express 4 API server for the TeachScript classroom management platform. Written in TypeScript, backed by MongoDB via Mongoose. Runs on port 4000 by default.

## Quick Start

```bash
# From the backend/ directory
cp .env.example .env       # then fill in your values
npm install
npm run dev                # starts on http://localhost:4000
```

Minimum required env vars to start:
```
MONGODB_URI=mongodb://localhost:27017/teachscript
JWT_SECRET=<any long random string>
FRONTEND_URL=http://localhost:5173
```

## Folder Structure

```
backend/src/
├── index.ts           ← Express app entry — mounts all routers, rate limits, CORS
│
├── middleware/
│   └── auth.ts        ← requireAuth, requireAdmin, AuthRequest type
│
├── lib/
│   ├── mongodb.ts     ← Mongoose connection helper
│   ├── claude.ts      ← Anthropic SDK wrapper (lesson assistant)
│   ├── pdf.ts         ← Certificate PDF generator (Puppeteer)
│   └── validateEnv.ts ← Checks required env vars on startup
│
├── models/            ← Mongoose schemas + TypeScript interfaces
│   ├── User.ts
│   ├── School.ts
│   ├── Class.ts
│   ├── Module.ts
│   ├── Quiz.ts
│   ├── QuizAttempt.ts
│   ├── CodeChallenge.ts
│   ├── ChallengeSubmission.ts
│   ├── Certificate.ts
│   ├── ModuleProgress.ts
│   ├── StudentActivity.ts
│   ├── TeacherSession.ts
│   ├── PasswordReset.ts
│   ├── PendingSignup.ts
│   └── FileToken.ts
│
└── routes/            ← One file per domain
    ├── auth.ts
    ├── signup.ts
    ├── users.ts
    ├── school.ts
    ├── teacher.ts
    ├── student.ts
    ├── modules.ts
    ├── quizzes.ts
    ├── challenges.ts
    ├── ai.ts
    ├── certificates.ts
    ├── studentCertificates.ts
    ├── files.ts
    ├── run.ts
    ├── reports.ts
    ├── payments.ts
    └── whatsapp.ts
```

## Authentication

All protected routes use the `requireAuth` middleware from `middleware/auth.ts`.

Auth is cookie-based: the frontend sends a `ts_token` httpOnly cookie on every request. For mobile/API clients, you can also pass `Authorization: Bearer <token>` in the request header.

```typescript
// Every protected route starts with this:
router.get("/my-route", requireAuth, async (req: AuthRequest, res) => {
  const user = req.user!   // guaranteed non-null after requireAuth
  const schoolId = user.school_id
  // ... always filter queries by schoolId
})
```

## API Reference

All routes are mounted under `/api/*`.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signin` | No | Login → sets `ts_token` httpOnly cookie |
| POST | `/signout` | No | Clears `ts_token` cookie |
| GET | `/me` | Yes | Current user profile |
| POST | `/forgot-password` | No | Send OTP reset email |
| POST | `/reset-password` | No | Reset password via token |

### Signup — `/api/signup`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check-email` | No | Check if admin email is available |
| POST | `/request` | No | Submit school signup application |
| GET | `/approve/:id` | HMAC | Approve school, create Admin account |
| GET | `/reject/:id` | HMAC | Reject application |

### School — `/api/school`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin | School info + counts |
| GET | `/classes` | Yes | All classes (with timetable + student counts) |
| POST | `/classes` | Admin | Create class |
| PATCH | `/classes/:id` | Admin | Rename / update subjects |
| DELETE | `/classes/:id` | Admin | Delete class |
| PUT | `/classes/:id/timetable` | Yes | Save timetable |

### Users — `/api/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/teachers` | Yes | Teachers in school |
| GET | `/students` | Yes | Students (optionally filtered by class) |
| POST | `/teachers/invite` | Admin | Invite teacher by email |
| POST | `/students/add` | Yes | Add one student |
| POST | `/students/bulk` | Yes | Bulk add students |
| POST | `/teachers/bulk-invite` | Admin | Bulk invite teachers |
| PATCH | `/teachers/:id` | Yes | Update teacher |
| PATCH | `/students/:id` | Yes | Update student |
| DELETE | `/:id` | Yes | Soft-delete user |

### Teacher — `/api/teacher`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/attendance` | Teacher | Save attendance records |
| GET | `/attendance` | Yes | Get attendance for date + period |
| GET | `/my-classes` | Teacher | Classes this teacher teaches |
| GET | `/student-timetable` | Yes | Student's class timetable |

### Student — `/api/student`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | Student | Dashboard stats + continue-learning |
| GET | `/classmates` | Student | Top 5 classmates by points |
| POST | `/activity/ping` | Student | Record login or item_viewed |
| POST | `/activity/clockout` | Student | Add session minutes |

### Modules — `/api/modules`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Modules for class + subject |
| POST | `/` | Teacher | Create module |
| PATCH | `/:id` | Teacher | Rename module |
| DELETE | `/:id` | Teacher | Delete module + files + progress |
| PUT | `/reorder` | Teacher | Reorder modules |
| POST | `/:id/items` | Teacher | Upload files (multipart, 200 MB max) or add link |
| PATCH | `/:id/items/:itemId` | Teacher | Rename item |
| DELETE | `/:id/items/:itemId` | Teacher | Delete item |
| PUT | `/:id/items/reorder` | Teacher | Reorder items |

### Quizzes — `/api/quizzes`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Quizzes for class (students see no correct_index) |
| POST | `/` | Teacher | Create quiz |
| DELETE | `/:id` | Teacher | Delete quiz |
| POST | `/:id/submit` | Student | Submit answers → score |
| GET | `/:id/attempts` | Yes | Student's attempts |
| GET | `/:id/results` | Teacher | All student results |

### Challenges — `/api/challenges`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Yes | Challenges for class |
| POST | `/` | Teacher | Create challenge |
| DELETE | `/:id` | Teacher | Delete challenge |
| POST | `/:id/submit` | Student | Submit code (upserts — re-submit overwrites) |
| GET | `/:id/submissions` | Teacher | All submissions for a challenge |
| GET | `/my-submissions` | Student | Student's own submissions |

### AI — `/api/ai`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/lesson-assist` | Teacher | `{question, context?, language?}` → Claude response |

### Certificates — `/api/certificates` and `/api/student-certificates`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/certificates` | Admin/Teacher | All issued certificates for school |
| GET | `/student-certificates/eligible` | Student | Subjects eligible to claim |
| POST | `/student-certificates/claim` | Student | Claim certificate for a subject |
| GET | `/student-certificates/my` | Student | Student's certificates |
| GET | `/student-certificates/download/:id` | Student | Download as PDF |

### Files — `/api/files`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/:token` | Token in path | Stream GridFS file (short-lived token) |

### Other

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/run` | Yes | Execute Python code in sandbox |
| POST | `/reports/activity-pdf` | Teacher | Generate Puppeteer PDF report |
| POST | `/payments/order` | Yes | Create Razorpay order |
| POST | `/payments/webhook` | Razorpay | Verify payment signature |

## Environment Variables

See [.env.example](.env.example) for all variables with explanations. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Signs auth tokens |
| `FRONTEND_URL` | Yes | CORS + email links |
| `ANTHROPIC_API_KEY` | Yes | Claude AI assistant |
| `APPROVAL_SECRET` | Yes | Signs signup approval links |
| `RESEND_API_KEY` | For email | Transactional emails |
| `RAZORPAY_KEY_ID` | For payments | Razorpay |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay |
| `WHATSAPP_API_TOKEN` | Optional | WhatsApp notifications |

## Scripts

```bash
npm run dev      # tsx watch — hot reload during development
npm run build    # tsc — compiles TypeScript to dist/
npm run start    # node dist/index.js — production
```

## Adding a New Route

1. Create or update a file in `routes/`
2. Always add `requireAuth` as the first middleware
3. Check `user.role` and `user.school_id` boundary at the top of every handler
4. Register the router in `index.ts`:
   ```typescript
   import myRouter from "./routes/myRoute.js"
   app.use("/api/my-route", myRouter)
   ```

## Data Conventions

- **School boundary**: every query that touches school data must include `school_id: user.school_id` — a teacher from school A must never read school B's data
- **Attendance rate**: `(present + late × 0.5) / total × 100`
- **Re-submissions**: `ChallengeSubmission` uses `findOneAndUpdate` with `upsert: true` — never `create()`
- **File tokens**: short-lived `FileToken` documents protect GridFS file access — they expire via TTL index
- **Select fields**: always use `.select("field1 field2")` and `.lean()` — never return full documents (would expose `password_hash`)
