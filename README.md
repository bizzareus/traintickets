# RailChart – Phase 1

Chart-based availability alerts for Indian Railways. Get instant alerts when seats open at chart time.

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Backend:** NestJS + Prisma
- **Database:** PostgreSQL (Supabase)

## Setup

### 1. Supabase (PostgreSQL)

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → Database**, copy the **Connection string (URI)**.
3. Use the **Session mode** (port 5432) URL for Prisma migrations; you can use **Transaction mode** (port 6543 with `?pgbouncer=true`) for the app if you prefer connection pooling.

### 2. Backend (NestJS)

```bash
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL (Supabase URI), JWT_SECRET, and optional API keys
npm install
npm run db:migrate
npm run db:seed
npm run start:dev
```

API runs at **http://localhost:3001**. The chart cron runs every minute inside the NestJS process.

### 3. Frontend (Next.js)

```bash
# From repo root
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3001 and NEXT_PUBLIC_APP_URL=http://localhost:3000
npm install
npm run dev
```

Open **http://localhost:3000**.

## Env vars

| Var | Where | Description |
|-----|--------|-------------|
| `DATABASE_URL` | Backend | Supabase PostgreSQL connection string |
| `JWT_SECRET` | Backend | Secret for JWT signing |
| `API_URL` | Backend | Backend base URL (for webhook callback) |
| `FRONTEND_URL` | Backend | Frontend origin (CORS) |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend API URL |
| `NEXT_PUBLIC_APP_URL` | Frontend | App URL (used in alert deep links) |
| `BROWSER_USE_*` | Backend | Browser Use API (availability checks) |
| `WHATSAPP_API_KEY`, `CALL_API_KEY` | Backend | Alert channels (optional) |

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Next.js frontend |
| `npm run dev:api` | Start NestJS backend (watch) |
| `npm run db:migrate` | Run Prisma migrations (from backend) |
| `npm run db:seed` | Seed trains and chart rules (from backend) |
| `npm run db:studio` | Open Prisma Studio (from backend) |

## Phase 1 flow

1. User searches route (from/to/date) and clicks **Monitor Availability**.
2. User selects train, class, station and clicks **Get Instant Alert** → creates a MonitoringRequest and ChartEventInstances.
3. Cron (every minute in NestJS) finds due ChartEventInstances, claims them via DB, and triggers Browser Use for each MonitoringRequest.
4. Webhook receives result: if `seat_available`, alerts are sent and request marked completed; else expired.
