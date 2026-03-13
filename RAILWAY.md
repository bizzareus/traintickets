# Railway Deployment (Railchart)

Deploy the **web** (Next.js) and **api** (NestJS + Prisma) services from this monorepo.

## One-time setup

### 1. Install Railway CLI

```bash
npm i -g @railway/cli
railway login
```

### 2. Create project and services

1. In [Railway](https://railway.app) create a new project.
2. Add **PostgreSQL** (Plugins → PostgreSQL). Note the `DATABASE_URL` (or `POSTGRES_URL`) from the PostgreSQL service variables.
3. Create two services from the same repo:
   - **web**: Connect repo; set **Root Directory** to `.` (repo root). Uses `railway.json` at root.
   - **api**: New service from same repo; set **Root Directory** to `backend`. Uses `backend/railway.json`.

### 3. Environment variables

**Web service**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Public URL of the API service (e.g. `https://your-api.up.railway.app`) |

**API service**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (from PostgreSQL plugin; often auto-linked) |
| `FRONTEND_URL` | Public URL of the web app (e.g. `https://your-web.up.railway.app`) for CORS |
| `PORT` | Set by Railway; backend listens on this |
| `OPENAI_API_KEY` | (Optional) For OpenAI features in service2 |
| `OPENAI_MODEL` | (Optional) e.g. `gpt-4o-mini` |
| `JWT_SECRET` | Secret for JWT auth (generate a random string) |

Generate domains for each service in Railway (Settings → Networking → Generate Domain) and set `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` to those URLs.

### 4. Link CLI to project

From repo root:

```bash
railway link
```

Select the project. To deploy a specific service, switch with:

```bash
railway service web   # or: api
```

## Deploy

From repo root (make the script executable once: `chmod +x scripts/railway-deploy.sh`):

```bash
# Deploy the currently linked service
./scripts/railway-deploy.sh

# Deploy a specific service (if your CLI supports --service)
./scripts/railway-deploy.sh web
./scripts/railway-deploy.sh api
./scripts/railway-deploy.sh all
```

Or with Railway CLI directly:

```bash
railway up
```

Migrations run automatically before each API deploy via `preDeployCommand` in `backend/railway.json` (`npx prisma migrate deploy`).

## Config in code

- **Web**: `railway.json` at repo root — build `npm run build:web`, start `next start` (uses `PORT` from Railway).
- **API**: `backend/railway.json` — build `npm run build`, pre-deploy `prisma migrate deploy`, start `npm run start:prod`.

To override per environment, use [Railway config as code](https://docs.railway.app/reference/config-as-code) `environments` in the same JSON files.
