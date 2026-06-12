# Codebase Organization & Modularity Principles

**Last Updated:** 2026-06-12

These guidelines enforce keeping the codebase clean, readable, KISS (Keep It Simple, Stupid), and modular (but not over-modularized).

## 1. Modularity & Concern Separation
* **Separate Verbose/Scraping Logic**: Verbose third-party browser automation code (e.g., Puppeteer/Playwright selectors) must be kept out of primary business logic services. 
  * *Example*: Keep `IrctcService` focused on HTTP API interaction and scheduling logic, while browser fallbacks like Puppeteer network interception are encapsulated in `IrctcBrowserFallbackService`.
* **Avoid Over-modularity**: Keep files grouped logically within the same module/feature directory (e.g. under `backend/src/irctc/`) rather than creating a new NestJS module for every minor service. This keeps imports simple and avoids module dependency hell.

## 2. Robust Fallbacks & Feature Flags
* **Toggle Resource-Heavy Tasks**: Puppeteer/Playwright browser fallbacks are resource-heavy and fragile. Always wrap their execution behind explicit environment feature flags (e.g., `IRCTC_BROWSER_FALLBACK_ENABLED === 'true'`).
* **Preserve Original Error Handling**: If a fallback is disabled via env flags or fails itself, always fall back to throwing the original, meaningful API error instead of hiding it.
* **Document Env Defaults**: Always document new feature flags in root `.env`, `.env.example`, and subproject-specific env configurations (e.g., `backend/.env`).

## 3. Asynchronous Safety & Lint Compliance
* **Avoid Promise Misuse**: Never return a Promise in synchronous callback registrations (like Puppeteer's `page.on('response', ...)`). Always wrap async tasks in a synchronous wrapper function, e.g., `(response) => { void (async () => { ... })(); }` to satisfy `typescript-eslint/no-misused-promises`.
* **Zero Warnings & Unused Vars**: Keep variables and parameters clean. If a variable in a catch block or lambda is unused, omit it or prefix with `_` to satisfy lint checks.
