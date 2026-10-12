# Booking regression checks

## Before pushing

```sh
npm run test:booking
```

The pre-push hook runs this command after the existing backend build. It includes
backend booking and logging tests, the real Nest HTTP contract tests, frontend
selection/sorting tests, and the Chromium booking E2E suite. Install Chromium once:

```sh
npm run test:e2e:install
```

## All browsers

```sh
npx playwright install chromium firefox webkit
npm run test:booking:cross-browser
```

The isolated harness starts Next.js on **3110** and a Nest contract server on
**3109**. It does not reuse a development server. Browser-generated booking
requests are forwarded through the real controller, DTO decorators, shared
production ValidationPipe, itinerary validation and exception filter. Checkout
and subsequent status responses are controlled test doubles. Unexpected API
requests and browser exceptions fail the test; payment, ads and telemetry are
intercepted. No real tickets, payment orders or notifications are created.

Coverage includes direct/split/partial/overnight journeys, selective ticket
booking, class and fare changes, PostHog rollout, every supported form option,
pairwise preference switches, invalid inputs, checkout recovery, payment states,
message origin/source validation, polling lifecycle, all issued PNRs, cancellation
and native-share/download behavior. Native share is stubbed; PNG generation is
real. OS share-sheet behavior still requires a real-device check.

## PostgreSQL integration

Create a dedicated local PostgreSQL database whose name starts with `booking_test`.
Set both Prisma CLI URLs to it before applying the existing migrations:

```sh
export BOOKING_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/booking_test
DATABASE_URL="$BOOKING_TEST_DATABASE_URL" DIRECT_URL="$BOOKING_TEST_DATABASE_URL" npm --prefix backend run test:booking:db:prepare
npm --prefix backend run test:booking:db
```

These tests use the real Prisma service, database, booking service and controller.
Only payment/fulfillment providers are mocked. They exercise saved form data,
pricing, verified and mismatched payments, concurrent callbacks, partial PNR
failure, manual fulfillment and cancellation persistence. Cleanup deletes only
records owned by each test. The harness refuses a non-local or non-test database.

## CI and deployment

`.github/workflows/booking-tests.yml` runs the checks on pull requests, manual
runs, and calls from the AWS deployment workflow. CI provisions PostgreSQL 16
and runs all five browser projects. Docker image builds and AWS deployment wait
for these checks to pass. Failed browser runs upload screenshots and traces.

Production and tests share `backend/src/common/validation-pipe.ts`; do not copy
its options into another test harness. Add browser scenarios under
`e2e/booking-*.spec.ts` and reuse `e2e/fixtures/booking-engine.ts`. Use synthetic
passenger data, fixture responses and Playwright's clock rather than live APIs
or arbitrary sleeps.
