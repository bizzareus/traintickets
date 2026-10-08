## 2026-09-22 - Admin Controller Authentication Pattern
**Vulnerability:** `RedditAutomationController` (`/api/admin/reddit-gtm`) was missing authentication guards, allowing unauthenticated public access to admin automation endpoints.
**Learning:** Admin endpoints in this codebase do not share a global admin guard; controllers explicitly enforce security via `assertAdminAuth({ headerPw: pw, req })` or `@UseGuards(JwtAuthGuard)`.
**Prevention:** Always verify that newly added `@Controller('api/admin/...')` endpoints explicitly invoke `assertAdminAuth` or NestJS guards.

## 2026-09-27 - Non-Admin Controller Admin Endpoints
**Vulnerability:** `AvailabilityController` (`@Controller('api/availability')`) contained sub-routes under `admin/*` (`admin/alerts`, `admin/notifications-analytics`, etc.) that were missing `assertAdminAuth`, exposing PII and admin triggers publicly.
**Learning:** Sub-routes named `admin/*` inside non-admin domain controllers (e.g., `AvailabilityController`) do not automatically inherit admin authentication and need explicit `assertAdminAuth` invocation.
**Prevention:** Audit all endpoints with `/admin/` in their route path across ALL domain controllers (not just `@Controller('api/admin')`) for explicit `assertAdminAuth` calls.

## 2026-09-29 - Uncaught RangeError in Webhook timingSafeEqual Verification
**Vulnerability:** In `WebhookController` and `WhatsappController`, passing a malformed signature with a byte length different from expected signature caused `crypto.timingSafeEqual` to throw an uncaught `RangeError`, resulting in 500 server errors or process exceptions instead of failing validation safely with 401 Unauthorized.
**Learning:** Node.js `crypto.timingSafeEqual(buf1, buf2)` throws `RangeError [ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH]` if `buf1.length !== buf2.length`.
**Prevention:** Always compare buffer lengths (`buf1.length !== buf2.length`) before calling `crypto.timingSafeEqual`, and wrap in `try...catch` as defense-in-depth.

## 2026-09-30 - JwtAuthGuard Missing Role Check on Admin Controllers
**Vulnerability:** `AdminController` (`@Controller('api/admin')`) used `@UseGuards(JwtAuthGuard)`. Because `JwtStrategy` only checks user existence without role verification, any regular authenticated user could access or modify admin resources (trains, chart rules, event instances).
**Learning:** `JwtAuthGuard` in this application verifies user identity but not administrative authorization. Admin endpoints must explicitly use `assertAdminAuth({ headerPw: pw, req })` or an explicit admin role check rather than relying solely on `JwtAuthGuard`.
**Prevention:** Audit any controller using `JwtAuthGuard` to ensure non-admin users cannot access administrative endpoints without `assertAdminAuth`.

## 2026-10-01 - Non-Constant-Time Secret Comparisons
**Vulnerability:** API key and admin password verification in `SeatCacheController` and `ChartTimeIngestionService` used non-constant-time equality operators (`===` / `!==`), creating timing side-channel risks.
**Learning:** Checking credentials with standard string operators leaks timing information about matching prefix lengths. Exporting `safeCompareStrings` from `admin-auth.ts` provides a consistent HMAC-digest constant-time check.
**Prevention:** Always use `safeCompareStrings(suppliedSecret, expectedSecret)` or `timingSafeEqual` when comparing secrets, passwords, or API keys.

## 2026-10-02 - Non-Constant-Time Secret Comparisons in Next.js API Routes
**Vulnerability:** Secret header checks in Next.js route handlers (`/api/indexnow` and `/api/chart-times-data/[id]`) used standard string equality (`!==`), exposing secrets to timing side-channel analysis.
**Learning:** Next.js route handlers run in Node.js runtime and can import `safeCompareStrings` from `lib/security.ts` to perform HMAC-digest constant-time comparison on secret headers (`INDEXNOW_SECRET`, `CHART_TIMES_SYNC_SECRET`).
**Prevention:** Always use `safeCompareStrings(suppliedSecret, expectedSecret)` when comparing API keys or authorization headers in Next.js route handlers.

## 2026-10-08 - Third-Party SDK Constructor Initialization Crashing DI Container
**Vulnerability:** `IrctcBrowserUseService` instantiated `new BrowserUse({ apiKey: process.env.BROWSER_USE_API_KEY })` directly in its constructor. When `BROWSER_USE_API_KEY` was missing in environment, the SDK threw an unhandled exception during NestJS dependency injection bootstrapping, crashing the entire NestJS application/worker on startup.
**Learning:** Third-party SDK constructors executed during NestJS provider instantiation must supply fallback initialization strings or lazy-load clients so that missing optional API keys do not cause unhandled startup exceptions during DI container setup.
**Prevention:** Provide fallback strings in SDK constructors for optional integrations and guard runtime method calls with explicit key checks throwing `ServiceUnavailableException`.
