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

## Project coding rules

### Principal engineering standards

Operate as a principal engineer focused on clear, maintainable, minimal solutions.

- **Continuous Optimization**: Whenever writing any new code or modifying existing code, actively simplify, refactor, and optimize it for minimal footprint and maximum clarity.
- **Post-Edit Quality Audit**: Immediately after writing or modifying any code, invoke the `code-quality-review` skill to audit all changes against principal engineering standards before declaring the task complete.
- **DRY**: avoid duplication; extract shared logic when repetition appears.
- **KISS**: prefer the simplest implementation that satisfies requirements.
- **SOLID**: keep responsibilities focused, dependencies clear, and behavior extensible without unnecessary complexity.
- **Minimal Declarative Code**: Prefer concise, declarative expressions (e.g. clean regex matchers, single-pass pipeline operations) over verbose multi-branch `if-else` blocks or repetitive string/array slicing.
- Prioritize code that is easy to read, reason about, and modify.
- Use clear naming and small, focused functions/modules.
- Avoid clever patterns that reduce clarity, but never write bloated boilerplate where a clean expression does the job.
- Reuse existing project utilities and modules before adding new ones.
- Prefer SQL/database capabilities for data filtering, aggregation, joins, and sorting when appropriate.
- Prefer established external libraries for well-solved problems instead of hand-rolled implementations.
- Less code is better when behavior, correctness, and maintainability are preserved.
- Remove unnecessary layers, abstractions, and dead code whenever encountered.
- Only add new code when no existing utility, query, or dependency can solve the problem cleanly.

### Shared utilities, npm, and where code lives

Always look for an existing implementation before adding new helpers or duplicating logic.

- **Frontend / Next app**: search and read `lib/` (for example `lib/utils.ts`, `lib/api.ts`, and other `lib/**/*.ts`). Use or extend these instead of reimplementing in `app/**/*.tsx`.
- **Backend**: search `backend/src` for existing services, helpers, or shared modules used across features.
- If something fits with a small extension, extend the existing module rather than copying logic into a page or route.
- Logic that could apply to more than one screen (formatting, parsing, API shaping, validation, constants, stream helpers, etc.) belongs in a shared module, typically under `lib/` for the app or a dedicated shared area under `backend/src`, not buried inside `app/page.tsx` or a single route file.
- Pages and API routes should import shared behavior; avoid large blocks of generic logic inline.

When implementing common, well-solved problems, use a maintained npm package instead of hand-rolled primitives.

- Dates / time zones / formatting / parsing: use something already in the project or add one lightweight option; avoid ad-hoc date string math.
- Collections and object utilities (deep clone, group-by, debounce, pick/omit, etc.): prefer `lodash-es`, `es-toolkit`, or small focused packages rather than a one-off reimplementation.
- IDs, validation, encoding, retry/backoff: prefer standard libraries where they reduce bugs.

Before adding a dependency:

1. Check `package.json` and `backend/package.json` for an existing library.
2. Prefer small or tree-shakeable packages.
3. Avoid a second library that duplicates the same role unless migrating.

Exceptions:

- Truly one-off UI glue that is not a reusable primitive.
- Performance-critical paths where profiling justifies custom code; document why.

Order of preference: existing project `lib/` or backend shared code, then npm, then a new shared module. Do not put reusable logic inline in a single page.

### Tailwind CSS only for UI styling

For all new and edited UI in this repo (pages, layouts, components under `app/`, shared React components):

- Use Tailwind CSS via `className` and utilities from `tailwind.config.ts`, including arbitrary values like `w-[123px]`, `bg-[#fff]`, or `min-h-[50vh]` when literals are needed.
- Do not introduce or expand inline `style={{ ... }}` for ordinary layout, spacing, typography, colors, flex/grid, borders, or shadows. Express these with Tailwind classes first.
- Do not add CSS Modules, `styled-components`, Emotion, or other CSS-in-JS styling stacks for component styling.
- Do not rely on new global CSS rules in `globals.css` or similar for what Tailwind utilities can express. Keep globals for true baselines only, such as resets or font faces, unless the user explicitly asks otherwise.
- Use the project’s existing patterns, such as `cn` / `clsx` plus `tailwind-merge` if present, to compose classes.

Narrow exceptions:

- APIs that only accept style objects or non-Tailwind styling, such as some chart/canvas options or `next/og` `ImageResponse` layouts. Use the minimum required there and still use Tailwind everywhere else in the same feature.
- Third-party components that inject their own styles. Wrap and align with Tailwind on project-owned elements; do not replace them with a parallel styling system.

Default: if styling UI, use Tailwind only.

### Database-first data with Prisma

Treat `backend/prisma/schema.prisma` as the contract whenever reading or writing persisted domain data (users, trains, chart rules, monitoring requests, executions, etc.).

1. Open and consult `backend/prisma/schema.prisma` first. Models, fields, relations, enums, and indexes define what exists and how it links.
2. Fetch and persist through the database using the project’s Prisma setup, such as `PrismaService` / services in `backend/src`, rather than reconstructing that state with ad-hoc in-memory structures, static fixtures, or duplicated logical copies of DB rows.

Do this:

- Prefer `prisma.*` queries with appropriate `include` / `select` to load what the UI or API needs.
- Align types and shapes with the schema and generated Prisma types, not hand-rolled parallel types that drift from the DB.
- If required data is not modeled, add or adjust models in `schema.prisma` and migrate. Do not fake long-lived data only in application code when it belongs in PostgreSQL.

Avoid this:

- Hardcoding datasets that should live in or come from tables defined in the schema.
- Skipping the DB and computing entity state in code when the same information is already stored or should be stored per the schema.
- Adding new API behavior that ignores existing tables and fields without checking the schema.

Scope:

- Backend: implement data access with Prisma against the real DB or documented test DB, following existing module patterns in `backend/src`.
- Frontend: get persisted data through backend APIs that themselves use the DB; do not invent server-side state on the client when the backend should query Prisma.

If unsure whether something is persisted, check `schema.prisma` before writing logic.

### Prisma migrations

When adding or modifying a Prisma migration in this project:

1. After creating or editing a migration, such as a new file under `backend/prisma/migrations/` or changes to `backend/prisma/schema.prisma`, run the migration via the terminal so the database stays in sync.
2. Run this command from the project root:

   ```bash
   npm run db:migrate
   ```

3. This runs `prisma migrate dev` in the backend and applies any pending migrations to the database.
4. Prefer running this command after introducing a new migration unless the user explicitly asks not to run it.
