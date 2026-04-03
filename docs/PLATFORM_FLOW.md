# Platform flow — planning reference

This document describes the **main user-visible flow** (search train → check vacant berths / AI plan), the **supporting APIs**, and **where the logic lives** so you can extend features without spelunking the whole repo.

---

## High-level architecture

| Layer       | Stack                                      | Role                                                                                           |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Frontend    | Next.js (`app/`)                           | Primary UI: train search, stations, journey date, submit check, show AI plan, monitor journey. |
| HTTP client | `lib/api.ts`, `lib/service2CheckStream.ts` | Axios to Nest (`NEXT_PUBLIC_API_URL`), JWT from `localStorage`, SSE parser for Service2.       |
| Backend     | NestJS (`backend/src/`)                    | IRCTC proxy + caching, chart times, Service2 orchestration, OpenAI, availability/monitoring.   |
| Data        | PostgreSQL + Prisma (`backend/prisma/`)    | Users, trains, chart rules, schedule cache, chart times, monitoring, etc.                      |

---

## Flow 1 — “Check seats” (Service2) — **core product path**

This is what happens when a user picks a train, from/to, date, and submits the main search on the landing page.

### 1. Frontend: load supporting data

| Step                                   | File           | What happens                                                                                                                                                                                               |
| -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stations dropdown (legacy / other UIs) | `app/page.tsx` | `GET /api/stations` via `apiClient` (`lib/api.ts`).                                                                                                                                                        |
| Train list for combobox                | `app/page.tsx` | `GET /api/irctc/trains` → `IrctcController` → `IrctcService.getTrainList()`.                                                                                                                               |
| Schedule after train selected          | `app/page.tsx` | `GET /api/irctc/schedule/:trainNumber` via **`irctcScheduleClient`** (retries/timeouts in `lib/api.ts`). Populates route order, default “from”, and **`trainRunsOn`** for “train doesn’t run this day” UX. |

### 2. Frontend: submit check (SSE)

| File                         | Logic                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/page.tsx`               | `handleSearch` → **`fetchService2CheckStream`** (`lib/service2CheckStream.ts`) `POST` to **`/api/service2/check/stream`** with `trainNumber`, `stationCode` (boarding), `journeyDate`, `classCode` (UI currently hardcodes `"3A"`), optional `destinationStation`. |
| `lib/service2CheckStream.ts` | Reads **Server-Sent Events**: `progress` (phases), `result` (final JSON), `error`. Invokes `onProgress` for live status / partial UI.                                                                                                                              |

**SSE progress phases** (drives loading copy and optional partial results):

- `started` — check began
- `irctc_complete` — vacant-berth aggregation done (`vacantSegmentCount`, errors summary)
- `ai_started` — about to call OpenAI
- `partial_ai_result` — multi-leg chain: first AI pass didn’t fully cover route; more vacant-berth fetches from `nextBoardingStation`

### 3. Backend: stream entrypoint (validation + schedule gate)

| File                                          | Logic                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/service2/service2.controller.ts` | `POST api/service2/check/stream`: normalizes body, sets SSE headers, then:                                                                                                                                         |
|                                               | 1. Validates `trainNumber`, `stationCode`, `journeyDate`.                                                                                                                                                          |
|                                               | 2. Parses journey date (`common/train-run-day.validation.ts`).                                                                                                                                                     |
|                                               | 3. **`IrctcService.getTrainSchedule`** with `fillRunsOnFromComposition` — ensures schedule + run-days; rejects if maintenance / empty / **train doesn’t run on date** (SSE `error` event with structured payload). |
|                                               | 4. Calls **`Service2Service.check(...)`** with hooks that **`writeSse('progress', …)`** and ends with **`writeSse('result', result)`**.                                                                            |

Non-streaming duplicate: `POST api/service2/check` (same core check, no progress events).

### 4. Backend: `Service2Service.check` — orchestration

**File:** `backend/src/service2/service2.service.ts`  
**Dependencies:** `IrctcService`, `ChartTimeService`

Approximate order (see in-file logs prefixed `[service2/check]`):

1. **Schedule again** (same as controller path for composition context; handles IRCTC maintenance).
2. **Chart “not ready yet”** — compares DB chart time + departure clock vs journey date (`chart-time` helpers + `ChartTimeService.getChartTime`). Early exit with `chartStatus.kind: 'not_prepared_yet'` if chart is still in the future.
3. **`getTrainComposition`** — classes, remote stations, `chartOneDate` / `chartTwoDate`, coach list (`cdd`). On “chart not prepared” errors, returns failed `chartStatus`.
4. **Persist chart time** — from `chartOneDate`, upsert via **`ChartTimeService.setChartTime`** → `TrainStationChartTime` (Prisma).
5. **Vacant berth (round 1)** — for **every class** on the train, **`IrctcService.getVacantBerth`** with `chartType` from second chart timing (`chartTypeFromComposition`). Boarding = user station, remote from composition. Aggregates `vbd` segments + per-class errors.
6. **Hook `onIrctcDataReady`** — frontend gets segment count + aggregated API errors.
7. **OpenAI (optional)** — if `OPENAI_API_KEY` set:
   - Builds **route micro-legs** with **`routeConsecutiveLegsForJourney`** (schedule + boarding + destination).
   - **`buildOpenAIUserMessage`** — IRCTC payload (composition, chart prep text, vacant JSON, schedule, optional chain boarding list).
   - **`client.responses.create`** with long **instructions** (`OPENAI_AGENT_PROMPT`) + **JSON schema** (`OPENAI_RESPONSE_JSON_SCHEMA`): `summary`, `seats[]`, `booking_plan[]`, `total_price`.
   - Parses with **`parseOpenAIStructuredResponse`**, normalizes plan with **`normalizeBookingPlanToRouteLegs`**, **`collapseConsecutiveDuplicateBookingInstructions`**, **`collapseFullJourneySingleTicketLegs`**, etc.
   - **Chain loop** (up to 12): if compact plan does **not** fully cover `routeLegsForPlan`, compute **`furthestTicketDestinationTowardGoal`** → **`resolveNextVacantBerthBoarding`** → **`onPartialOpenAiResult`** → append another **`appendVacantBerthRound`** from the new boarding → repeat OpenAI with expanded `vacantBerthChainBoardings`.
8. **Final status** — `failed` if vacant-berth API had errors **and** there is no usable OpenAI output; else `success`.
9. **Response body** — includes `composition`, `chartPreparationDetails`, **`openAiSummary`**, **`openAiStructuredSeats`**, **`openAiBookingPlan`**, **`openAiTotalPrice`**, **`trainSchedule`**. Note: **`vacantBerth.vbd` is returned empty** in the final object (raw segments are used server-side for prompting; plan UI around AI fields unless you change this).

**Related pure helpers in the same file:** `toStr`, `isFilledOpenAiPlanItem`, `routeConsecutiveLegsForJourney`, `compactPlanFullyCoversRoute`, `furthestTicketDestinationTowardGoal`, etc.

---

## Flow 2 — IRCTC integration (shared building block)

**File:** `backend/src/irctc/irctc.service.ts`  
**Controller:** `backend/src/irctc/irctc.controller.ts` (`/api/irctc/*`)

| Capability        | Behavior                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Train list        | Sourced from DB / list APIs (see service).                                                                                                                |
| Schedule          | **`trnscheduleenquiry`**-style upstream; **cached** in **`TrainScheduleCache`** (Prisma). Can **`fillRunsOnFromComposition`** when weekday flags missing. |
| Train composition | Online-charts **`trainComposition`** API.                                                                                                                 |
| Vacant berth      | **`vacantBerth`** API with retries; used heavily by Service2.                                                                                             |

Headers and URLs are tuned to match browser IRCTC behavior (see constants at top of `irctc.service.ts`).

---

## Flow 3 — “Monitor journey” (notifications / availability pipeline)

**Frontend:** `app/page.tsx` — `submitJourneyMonitor`  
**Backend:** `backend/src/availability/availability.controller.ts`

| Endpoint                                  | Purpose                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `POST /api/availability/journey/validate` | Validate journey (including run-day); used before creating a monitor. |
| `POST /api/availability/journey`          | Queue / register monitoring with contact info.                        |

Deeper job execution ties into **`JourneyTaskService`**, **`AvailabilityService`**, **`NotificationService`**, Prisma models like **`MonitoringRequest`**, **`BrowserExecution`** (see `schema.prisma`). This path is **separate** from the interactive Service2 SSE check.

---

## Other API surfaces (feature planning)

| Area                           | Files                                                              | Notes                                                                                    |
| ------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Auth / dashboard               | `backend/src/auth/*`, `app/login`, `app/register`, `app/dashboard` | JWT; `getAuthHeaders()` in `lib/api.ts`.                                                 |
| Trains CRUD (admin/product)    | `backend/src/trains/*`, `app/admin/trains`                         | Distinct from IRCTC live list.                                                           |
| Search                         | `backend/src/search/*`, `app/search/page.tsx`                      | Product search UX.                                                                       |
| Chart rules / cron / ingestion | `chart-cron`, `chart-time-ingestion`, `chart-event`, `app/admin/*` | Scheduling and tooling around chart times and events.                                    |
| Rail feed proxy                | `backend/src/rail-feed-proxy/*`                                    | `GET /api/rail-feed/availability` → upstream POST proxy (optional integration surface).   |
| Webhooks                       | `backend/src/webhook/*`                                            | External callbacks.                                                                      |
| Browser automation             | `backend/src/browser-use/*`                                        | Used in monitoring / execution flows.                                                    |

---

## Configuration touchpoints

- **Frontend API base:** `NEXT_PUBLIC_API_URL` (default `http://localhost:3009` in `lib/api.ts`).
- **Service2 AI:** `OPENAI_API_KEY`, optional `OPENAI_MODEL` and tuning via env (see `service2.service.ts`: `openAiTextVerbosity`, `openAiResponsesTuning`).
- **Backend env:** `backend/.env.example` for full list.

---

## Quick file index (main flow)

| File                                             | Responsibility                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `app/(main)/page.tsx`, `app/v1/page.tsx`         | Main landing (v2 train search); legacy v1 flow at `/v1`.                          |
| `lib/api.ts`                                     | Axios instances, auth headers, IRCTC schedule client + retries.                 |
| `lib/service2CheckStream.ts`                     | SSE client for Service2 check.                                                  |
| `backend/src/service2/service2.controller.ts`    | HTTP + SSE for Service2 check.                                                  |
| `backend/src/service2/service2.service.ts`       | IRCTC + chart time + vacant berth + OpenAI chain.                               |
| `backend/src/irctc/irctc.service.ts`             | IRCTC HTTP + Prisma schedule cache.                                             |
| `backend/src/chart-time/chart-time.service.ts`   | Persist / read chart HH:MM per train+station.                                   |
| `backend/src/common/train-run-day.validation.ts` | Journey date + `trainRunsOn` validation (shared with stream).                   |

---

## Ideas for future features (where to change)

| Idea                                     | Likely touch points                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| User-selectable class (not hardcoded 3A) | `app/page.tsx` (form + POST body), ensure Service2 already receives `classCode` (it does).                          |
| Show raw vacant segments in UI           | `Service2Service.check` return value currently clears `vbd`; consider returning a summary or redacted list.         |
| Richer AI prompt / output schema         | `OPENAI_AGENT_PROMPT`, `OPENAI_RESPONSE_JSON_SCHEMA`, `parseOpenAIStructuredResponse` in `service2.service.ts`.     |
| Fewer / smarter chain rounds             | `maxOpenAiChain`, `furthestTicketDestinationTowardGoal`, `resolveNextVacantBerthBoarding` in `service2.service.ts`. |
| New third-party rail API                 | New Nest module + controller pattern like `rail-feed-proxy` or extend `irctc.service.ts`.                            |

---

_Generated for internal planning; update this doc when you add major flows or move endpoints._
