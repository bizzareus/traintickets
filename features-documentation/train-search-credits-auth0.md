# Train Search Credits + Auth0 SMS Login — Design & Implementation Plan

## 1. Agreed product rules

- **3 lifetime free ticket searches per IP address.** No login required.
- **4th search opens a payment popup**: ₹100 (introductory) for **100 search credits**.
- Credits **never expire**. No monthly cap, no automatic billing. Buy another pack after exhaustion.
- Paid credits belong to the **authenticated account** (Auth0 passwordless SMS), work across devices/IPs after sign-in.
- A credit is consumed by a **completed search**, including valid “no tickets found” and cached results.
- Technical failures/timeouts are **not charged**. Reopening a displayed result or retrying the same request ID is **not charged twice**.
- **Sync**: validate credits + persist a durable PENDING search log before starting.
- **Async**: decrement balances in the background (fire-and-forget + reconciling cron).
- Fully-async debit is a **soft limit**: fast/concurrent requests can exceed the balance; over-limit completions are logged as uncharged, balances never go negative.

## 2. Identity (Auth0)

- Auth0 tenant `dev-51mig3oc34k3n6nu` (`https://dev-51mig3oc34k3n6nu.us.auth0.com`), Regular Web Application.
- Passwordless **SMS OTP** connection (already configured in Auth0).
- Backend API audience: **`https://api.lastberth.com`** (custom API to create in Auth0 dashboard, RS256).
- Frontend uses `@auth0/nextjs-auth0` (session cookies + `/auth/*` via `proxy.ts`).
- NestJS verifies the **access-token JWT** (signature via JWKS, `iss`, `aud`, `exp`) on every paid/balance call.
- `User` links via `auth0Sub` (stable) + verified `phone` (E.164). An IP→account purchase link is attribution only — it never grants the IP access to someone else's wallet.

## 3. Data model (Prisma, PostgreSQL)

| Model | Key fields |
|---|---|
| `User` (extended) | `auth0Sub String? @unique`, `phone String?`, `phoneVerifiedAt DateTime?`, `passwordHash String?` (nullable for phone-only), `email String? @unique` (nullable for phone-only) |
| `SearchIpQuota` | `ipHash String @unique` (sha256 of canonical IP + salt), `ipDisplay String?`, `freeUsed Int @default(0)`, timestamps |
| `SearchCreditWallet` | `userId String @unique`, `totalPurchased Int @default(0)`, `balance Int @default(0)`, timestamps |
| `SearchCreditPurchase` | `purchaseRef String @unique` (`SC-…`), `userId`, `originIpHash String?`, `amount Int` (100 = ₹100), `creditQuantity Int` (100), `currency`, `status PENDING/PAID/FAILED`, `muzoboxPaymentId @unique?`, `payUrl?`, `razorpayOrderId?`, `razorpayPaymentId?`, `contactEmail?`, `contactMobile?`, `paidAt?`, timestamps |
| `SearchUsageLog` | `requestId String @unique`, `userId?`, `ipHash`, `trainNumber`, `fromStation`, `toStation`, `journeyDate?`, `classes String[]`, `quota`, `source FREE/PAID`, `outcome PENDING/SUCCESS/FAILED`, `debitStatus PENDING_DEBIT/SETTLED/SKIPPED/OVER_LIMIT_UNCHARGED`, `error?`, timestamps |

Invariants: one wallet per user; unique request/payment IDs; `balance >= 0`, `freeUsed >= 0`; duplicate request IDs idempotent; same request ID + different fingerprint → 409.

## 4. Backend flow (`backend/src/search-credits/`)

```text
Click Find Tickets
  → resolve IP (Express req.ip, trusted proxy) + optional Auth0 user
  → read balance (no reservation)
  → none? → HTTP 402 { code: SEARCH_CREDITS_EXHAUSTED, freeRemaining, paidBalance } → popup
  → persist PENDING SearchUsageLog (durable; idempotent on requestId)
  → run search / serve cache
  → mark SUCCESS / FAILED
  → background settle (immediate best-effort + 30s worker cron for crash recovery)
```

- `admitSearch()` throws 402 when `freeUsed >= 3` (anonymous or no paid balance) or paid `balance <= 0` (authenticated, free exhausted).
- Authenticated users consume **paid credits first**, free IP allowance is separate per-IP state.
- `settlePendingLogs()` (transactional): FREE → `ipQuota.freeUsed + 1`; PAID → `wallet.balance - 1` if `> 0` else mark `OVER_LIMIT_UNCHARGED`; FAILED → `SKIPPED`.
- Endpoints: `GET /api/search-credits/balance`, `POST /api/search-credits/admit` (cached-preview path), `POST /api/search-credits/complete`, `POST /api/search-credits/purchases`, `GET /api/search-credits/purchases/:ref`, `POST /api/search-credits/purchases/:ref/verify`, `POST /api/search-credits/muzobox-callback`.
- `BookingV2Controller` admits before streaming headers on `alternate-paths`, `alternate-paths/stream`, `best-trains/stream`; marks outcome after completion.
- Train-list discovery previews (`cachedAlternatePath` shown without a scan request) stay free: no click, no request, no charge. Every Find Tickets scan request — live or cache-hit — is admitted and charged on completion.
- Payment reuses `createMuzoboxClient` + split-booking verify-then-grant pattern (callback = hint; server-to-server verify; atomic purchase-PAID + wallet +100).
- Until the `AUTH0_*` env vars are set, `proxy.ts` skips the Auth0 middleware and the backend treats visitors as guests (free-IP path only).

## 5. Frontend

- `lib/auth0.ts` + `proxy.ts` composition (redirects first, then `auth0.middleware`).
- `lib/search-credits.ts`: balance/admit/complete/purchase helpers, `X-Search-Request-Id`, Bearer from `/auth/access-token` (best-effort anonymous), 402 parsing.
- `components/search-credits/SearchCreditsPaywall.tsx`: sign-in → buy ₹100 (Muzobox frame) → polling verify → resume search. Copy: “You've used your 3 free searches. Get 100 search credits for ₹100. Credits never expire.”
- `TrainSearchV2Card.executeScan`: inject requestId + auth headers; 402 → paywall; cached instant-open path admits via `/admit` before `showResult`.
- `useAlternatePaths.findAlternates`: same headers; surfaces `SEARCH_CREDITS_EXHAUSTED` for the modal paywall.
- Tailwind only; reuse `apiClient`, `MuzoboxPaymentFrame`.

## 6. Env (no secrets in repo)

Backend: `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `SEARCH_CREDITS_IP_SALT` (optional), existing `MUZOBOX_*`.
Frontend: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`.
Auth0 dashboard: allow `http://localhost:3010/auth/callback`, `https://lastberth.com/auth/callback`, `https://v2.lastberth.com/auth/callback` (+ logout URLs); enable SMS connection for the app.

## 7. Tests

- 3 free admitted → 4th 402; ₹100 grants exactly 100, never expires.
- No-result/cached charge; failures don't; same requestId retries don't double-charge.
- Duplicate callbacks/polling grant once; forged return params grant nothing.
- Worker restart recovers PENDING_DEBIT; balances never negative; over-limit logged uncharged.
- Shared IP can't spend another user's wallet; cross-device sign-in restores wallet.
