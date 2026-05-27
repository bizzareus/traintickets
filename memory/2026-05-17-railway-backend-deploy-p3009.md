# Railway Backend Deploy P3009

Date: 2026-05-17

Symptom:
- Railway backend deployments failed during pre-deploy.
- User also saw a local-looking `Cannot find module './app.module'` stack trace from `backend/dist/main.js`.

Root cause:
- Railway deploy logs showed the actual production failure was Prisma `P3009`, not the `app.module` stack trace.
- The runtime safety code had already created the `CronLease` table in production.
- The Prisma migration `20260517161000_add_cron_lease` then tried to create the same table and failed with `relation "CronLease" already exists`.
- Prisma marked the migration failed, causing later `migrate deploy` runs to stop before startup.

Fix:
- Confirmed production `CronLease` table exists with expected columns.
- Ran `prisma migrate resolve --applied 20260517161000_add_cron_lease` against Railway production backend DB.
- Ran `prisma migrate deploy` and `prisma migrate status`.
- Redeployed backend.

Evidence:
- `prisma migrate status`: `Database schema is up to date!`
- Railway deployment `3762fe79-234d-4bc3-b080-1045576b48d1`: `SUCCESS`.
- `GET /`: HTTP 200.
- `GET /api/booking-v2/stations/suggest?q=Panvel&searchString=Panvel`: HTTP 200.
