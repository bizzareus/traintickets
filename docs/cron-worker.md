# Dedicated cron worker

The backend image has two entry points:

| Container | Entry point | Responsibility |
| --- | --- | --- |
| `backend` | `node dist/main.js` | HTTP API on port 3009; no scheduler |
| `worker` | `node dist/worker.js` | Nest application context with scheduled jobs; no HTTP listener |

Only `WorkerModule` imports `ScheduleModule.forRoot()`. It runs chart alerts,
alternative searches, notification retries, daily failed-delivery refunds, seat
cache warming, and the Wasender healthcheck. Existing enable/disable switches
still apply. IRCTC cookies are managed manually in the API process.

Both containers use `backend/.env`. PostgreSQL task rows, claims, retry state,
cron leases and IRCTC cookies, plus the DynamoDB seat cache, remain shared. No
in-memory queue or API-to-worker HTTP call is needed. Each process has its own
database connection pool; account for both when setting `DATABASE_POOL_MAX`.
Start with one worker. Existing leases and task fencing remain in place, but
not every maintenance job has a distributed lease.

## Memory and host sizing

Each container defaults to a **450 MiB V8 old-space limit** and a **768 MiB Docker
memory limit**, leaving room for buffers, native libraries, and other process
memory. An OOM in one Node process no longer kills the other process.

The previously documented **1 GiB t3.micro is too small for both default memory
budgets**. Use at least a 2 GiB backend host as a starting point, with additional
headroom if running local Chromium. Measure peak RSS under real traffic. A
separate container isolates heaps and restart cycles, but still shares the host's
RAM and CPU. This change does not resize EC2 or prove the original OOM is fixed.

Optional overrides go in `infra/.env` (Compose interpolation), not
`backend/.env` (container environment):

```dotenv
BACKEND_NODE_OPTIONS=--max-old-space-size=450
WORKER_NODE_OPTIONS=--max-old-space-size=450
BACKEND_MEMORY_LIMIT=768m
WORKER_MEMORY_LIMIT=768m
```

Keep each heap limit below its container limit. Docker restarts a failed worker
independently. Interrupted chart tasks become eligible after their existing lease
deadline; process termination does not guarantee an in-flight notification drains.

## Development

`npm run dev` starts the API, worker, and frontend. `npm start` does the same for
the compiled applications. `npm run dev:api` starts only the API; use
`npm run dev:worker` separately when testing scheduling. In the backend directory,
the equivalent commands are `npm run start:dev`, `npm run start:worker:dev`, and
`npm run start:worker` for the compiled worker.

Use a local database and local API/frontend URLs for both processes; injected
production environment variables override dotenv files. Development mode still
disables the seat-cache warmer as before.

## Docker rollout

The AWS workflow and `infra/deploy.sh backend aws` build/pull the backend image
once, migrate first, replace the API, then start the worker. Replacing the API
first removes the old in-process schedules before enabling the new worker. Old
cron leases may delay the first chart run until their TTL expires (normally 90s).

After building or pulling the image, the equivalent commands from the repo root
are:

```sh
docker compose -f infra/docker-compose.yml run --rm --no-deps backend npx prisma migrate deploy
docker compose -f infra/docker-compose.yml up -d --no-build backend
docker compose -f infra/docker-compose.yml up -d --no-build worker caddy
docker compose -f infra/docker-compose.yml logs --tail=100 worker
docker compose -f infra/docker-compose.yml stats --no-stream backend worker
```

Worker startup logs `Cron worker ready: 6 scheduled jobs; no HTTP listener`.
Verify subsequent cron runs in `cron_run_log` / Cronitor. API logs should no longer
contain automatic `initiated cron` messages. Deploy both entry points together;
deploying only the new API leaves scheduled work stopped.

To run the worker on another host, provide the same image and application env,
start only the `worker` Compose service there, and keep exactly one scheduled
worker running. That host also needs database, DynamoDB and upstream API access
including AWS credentials or an appropriate instance role.
