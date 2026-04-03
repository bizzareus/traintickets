# AGENTS.md

## Cursor Cloud specific instructions

### Architecture

Two-service monorepo: Next.js frontend (root `/`, port 3010) + NestJS backend (`backend/`, port 3009). Both use **npm**. Database is PostgreSQL via Prisma ORM (`backend/prisma/schema.prisma`).

### Local PostgreSQL requirement

A local PostgreSQL instance is required. The cloud VM has PostgreSQL 16 installed. Start it with `sudo pg_ctlcluster 16 main start`. The database name is `railchart` with user `postgres` / password `postgres`.

The `backend/.env` file's `DATABASE_URL` must point to the local PostgreSQL (not the remote Supabase URL).

### Injected environment variable override

Cloud agent VMs inject secrets as shell environment variables (e.g. `NEXT_PUBLIC_API_URL`, `API_URL`, `FRONTEND_URL`) that point to **remote production URLs**. These override dotenv files since shell env takes precedence. When starting services locally, **explicitly pass local URLs** as env vars:

```bash
# Backend — override DATABASE_URL, API_URL, FRONTEND_URL, NEXT_PUBLIC_APP_URL
# to point to localhost ports (3009 for backend, 3010 for frontend)
cd /workspace/backend && \
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/railchart" \
  API_URL="http://localhost:${BACKEND_PORT:-3009}" \
  FRONTEND_URL="http://localhost:${FRONTEND_PORT:-3010}" \
  NEXT_PUBLIC_APP_URL="http://localhost:${FRONTEND_PORT:-3010}" \
  npm run start:dev

# Frontend — override NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL
cd /workspace && \
  NEXT_PUBLIC_API_URL="http://localhost:${BACKEND_PORT:-3009}" \
  NEXT_PUBLIC_APP_URL="http://localhost:${FRONTEND_PORT:-3010}" \
  npm run dev:web
```

### Key commands (see `package.json` scripts for full list)

| Task | Command |
|---|---|
| Start both (dev) | `npm run dev` (root) — but see env override note above |
| Frontend only | `npm run dev:web` |
| Backend only | `npm run dev:api` |
| Frontend lint | `npm run lint` (root) |
| Backend lint | `cd backend && npm run lint` |
| Backend tests | `cd backend && npm test` |
| Run migrations | `npm run db:migrate` |
| Seed database | `npm run db:seed` |

### Notes

- Backend lint has pre-existing errors in `booking-v2` service files (`@typescript-eslint/no-base-to-string`). These are not introduced by setup.
- The `postinstall` script in `backend/package.json` runs `prisma generate` automatically on `npm install`.
- The Prisma config uses `prisma.config.ts` — migrations read `DATABASE_URL` from `backend/.env`.
- Train search returns all trains from the `TrainList` table; filtering is done client-side in the frontend autocomplete.
- Default ports: backend = 3009, frontend = 3010.
