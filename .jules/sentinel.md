## 2026-09-22 - Admin Controller Authentication Pattern
**Vulnerability:** `RedditAutomationController` (`/api/admin/reddit-gtm`) was missing authentication guards, allowing unauthenticated public access to admin automation endpoints.
**Learning:** Admin endpoints in this codebase do not share a global admin guard; controllers explicitly enforce security via `assertAdminAuth({ headerPw: pw, req })` or `@UseGuards(JwtAuthGuard)`.
**Prevention:** Always verify that newly added `@Controller('api/admin/...')` endpoints explicitly invoke `assertAdminAuth` or NestJS guards.
