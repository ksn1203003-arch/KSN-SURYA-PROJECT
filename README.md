# TeachScript

AI-powered classroom management platform for Indian schools (Classes 3–8). CBSE / State / ICSE aligned. Serves three roles: **teachers** manage lessons and push coding challenges and quizzes; **students** consume lessons, attempt quizzes, write code, and track attendance; **admins** manage the school's classes, teachers, and students.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + shadcn/ui |
| Backend | Express 4 + Node.js (TypeScript via tsx) |
| Database | MongoDB 7 via Mongoose 9 |
| File Storage | MongoDB GridFS (no separate storage service) |
| Auth | JWT (httpOnly cookie `ts_token`) + bcryptjs |
| AI | Claude `claude-sonnet-4-6` via Anthropic SDK |
| PDF | Puppeteer (certificates + activity reports) |
| Payments | Razorpay |
| Email | Resend |
| PWA | vite-plugin-pwa + Workbox |
| Deploy | Vercel (frontend) + Render (backend) + MongoDB Atlas |

## Folder Structure

```
ClassroomAI/
├── frontend/          ← React app (Vite)
│   ├── src/
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── .env           ← create from .env.example
│   └── .env.example
│
├── backend/           ← Express API server
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env           ← create from .env.example
│   └── .env.example
│
├── CLAUDE.md          ← instructions for AI assistant
└── README.md          ← this file
```

## Local Setup

### Prerequisites
- Node.js 20+
- MongoDB running locally (or a MongoDB Atlas URI)

### 1. Install dependencies

```bash
# Install frontend deps
cd frontend && npm install

# Install backend deps
cd ../backend && npm install
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — fill in MONGODB_URI, JWT_SECRET, ANTHROPIC_API_KEY at minimum

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env — VITE_BACKEND_URL=http://localhost:4000 is already correct for local dev
```

### 3. Start both servers

```bash
# Terminal 1 — Backend (http://localhost:4000)
cd backend && npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend && npm run dev
```

### 4. Create your first school

Open `http://localhost:5173` → click **Sign Up** → fill in school details. Then approve the signup by visiting the approval link sent to `OWNER_EMAIL`.

Or, go to `http://localhost:4000/api/signup/approve/<id>` directly using the link printed in the backend console log.

## Demo Credentials

| Role | Login | Password |
|---|---|---|
| Student | username: `5c4` | `TS@GHZg5b8` |
| Teacher | `priya.sharma@dps-hyd.edu.in` | `Teacher@1234` |
| Admin | `ksn1203003@gmail.com` | `Admin@1234` |

The login page accepts phone number, email, or username in the same input field.

## Architecture

```
Browser ──► Vercel (Vite SPA — React)
               │
               └──► Render (Express API — Node.js)
                        │
                        ├── MongoDB Atlas (all data + GridFS files)
                        │
                        ├── /api/ai/lesson-assist      ← Anthropic Claude
                        ├── /api/certificates/download ← Puppeteer PDF
                        ├── /api/reports/activity-pdf  ← Puppeteer PDF
                        ├── /api/payments/*            ← Razorpay
                        ├── /api/whatsapp/*            ← WhatsApp Business API
                        └── /api/files/:token          ← GridFS file streaming
```

All files (lesson PDFs, PPTX uploads, images) are stored in MongoDB GridFS — no external storage bucket needed.

## Key API Endpoints

All routes are under `/api/`. Auth = requires `ts_token` cookie or `Authorization: Bearer <token>` header.

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/api/auth/signin` | All | Login → sets `ts_token` cookie |
| GET | `/api/auth/me` | Auth | Current user profile |
| GET | `/api/modules` | Auth | Lesson modules for a class + subject |
| POST | `/api/modules/:id/items` | Teacher | Upload files (up to 200 MB each) |
| POST | `/api/quizzes/:id/submit` | Student | Submit quiz answers |
| POST | `/api/challenges/:id/submit` | Student | Submit code |
| POST | `/api/ai/lesson-assist` | Teacher | Ask the Claude AI assistant |
| POST | `/api/student-certificates/claim` | Student | Claim a completion certificate |
| GET | `/api/files/:token` | Anyone | Stream a GridFS file (token-gated) |

See [backend/README.md](backend/README.md) for the full API reference.

## Deploy

### Frontend — Vercel
1. Connect the `frontend/` directory to a Vercel project
2. Add `VITE_BACKEND_URL` and `VITE_RAZORPAY_KEY_ID` in Vercel dashboard → Settings → Environment Variables
3. Push — Vercel auto-detects Vite

### Backend — Render
1. Create a **Web Service**, set **Root Directory** to `backend/`
2. Build command: `npm install && npm run build`
3. Start command: `node --env-file=.env dist/index.js`
4. Add all env vars from `backend/.env.example`
5. Add Razorpay webhook → `https://your-render-url/api/payments/webhook`

### Database — MongoDB Atlas
1. Create a free cluster at mongodb.com/atlas
2. Create a database user and whitelist your Render IP (or allow all: `0.0.0.0/0`)
3. Copy the connection string into `MONGODB_URI` on Render

## Scripts

### Frontend (`frontend/`)
```bash
npm run dev      # Dev server — http://localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
npx tsc --noEmit # Type check without building
```

### Backend (`backend/`)
```bash
npm run dev      # Dev server with hot reload — http://localhost:4000
npm run build    # TypeScript → dist/
npm run start    # Run dist/index.js (production)
npx tsc --noEmit # Type check without building
```
