## 2026-09-22 - Admin Controller Authentication Pattern
**Vulnerability:** `RedditAutomationController` (`/api/admin/reddit-gtm`) was missing authentication guards, allowing unauthenticated public access to admin automation endpoints.
**Learning:** Admin endpoints in this codebase do not share a global admin guard; controllers explicitly enforce security via `assertAdminAuth({ headerPw: pw, req })` or `@UseGuards(JwtAuthGuard)`.
**Prevention:** Always verify that newly added `@Controller('api/admin/...')` endpoints explicitly invoke `assertAdminAuth` or NestJS guards.

## 2026-09-27 - Non-Admin Controller Admin Endpoints
**Vulnerability:** `AvailabilityController` (`@Controller('api/availability')`) contained sub-routes under `admin/*` (`admin/alerts`, `admin/notifications-analytics`, etc.) that were missing `assertAdminAuth`, exposing PII and admin triggers publicly.
**Learning:** Sub-routes named `admin/*` inside non-admin domain controllers (e.g., `AvailabilityController`) do not automatically inherit admin authentication and need explicit `assertAdminAuth` invocation.
**Prevention:** Audit all endpoints with `/admin/` in their route path across ALL domain controllers (not just `@Controller('api/admin')`) for explicit `assertAdminAuth` calls.
