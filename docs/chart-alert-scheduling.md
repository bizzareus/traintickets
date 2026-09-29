# Chart-alert scheduling contract

## Frontend owns the selected chart times

Both paid (`POST /api/chart-alert-payments/create`) and free/direct
(`POST /api/availability/journey`) subscriptions submit the selected clocks and
their day offsets, anchored to the train-start date:

```json
{
  "trainNumber": "12665",
  "fromStationCode": "RJY",
  "toStationCode": "DG",
  "journeyDate": "2026-09-29",
  "trainStartDate": "2026-09-28",
  "classCode": "SL",
  "email": "passenger@example.com",
  "chartTimeLocal": "19:08",
  "chartOneDayOffset": 0,
  "chartTwoTimeLocal": "05:35",
  "chartTwoDayOffset": 1
}
```

The first event is required. Omit both second-event fields for a single-chart
subscription. Clocks must be 24-hour `HH:MM`; offsets must be integers from -30
through 30. The second event must be later than the first, including its offset.
Dates are calendar dates, not local-midnight timestamps.

For the example above, the backend writes exactly two tasks:

| Chart number | IST | UTC-valued `chart_at` |
| --- | --- | --- |
| 1 | 28 September, 19:08 | `2026-09-28 13:38:00` |
| 2 | 29 September, 05:35 | `2026-09-29 00:05:00` |

`lib/chart-alert-schedule.ts` is the shared client preparation step. Table buttons
already supply the displayed values. Other entry points load the same existing
page snapshot from `GET /api/chart-alert-schedule/:trainNumber/:stationCode` before
submitting. That read-only endpoint returns a station row from the existing page
cache; it does not trigger ingestion. Missing data stops setup before payment.

The backend validates the snapshot, stores it in the payment payload, and uses it
unchanged after payment confirmation. Task creation never replaces the selected
times with database-cache values or a departure-minus-four-hours estimate. It
also no longer writes a customer's selection into the shared train chart cache.

## Processing and notification outcomes

- Each task saves its chart number and UTC instant. Initial notifications and
  resends use this event rather than today's mutable chart cache.
- Deduplication for scheduled alerts is scoped by recipient, channel, train,
  journey date, and chart instant. The second chart remains independently eligible.
- Per-channel states distinguish `sent` (provider accepted), `pending_retry`,
  `unsend` (attempt limit reached), and `suppressed`. Suppression does not consume
  attempts or invent a send timestamp. **Sent does not mean delivered/read.**
- Confirmed `PAID` subscriptions get **eight retries after the initial attempt**
  (nine attempts maximum) per channel. Free, pending-payment, and failed-payment
  subscriptions retain the three-attempt limit. Payment eligibility is read from
  `chart_alert_payment` using the journey request ID, not the payment's age.
- Recovery looks back from task completion, not subscription purchase. It handles
  old subscriptions, NULL legacy statuses, no-destination alerts, and terminal
  check failures. A failed check produces an explicit availability-unconfirmed
  notice, not a no-seats claim.
- Recovery claims use a five-minute notification-attempt cooldown, preventing
  concurrent workers from immediately resending the same task.
  The recovery cron polls each minute at second 40, so a due retry runs on the
  first tick after the five-minute cooldown, normally within five to six minutes.
  This avoids the nearly ten-minute gaps caused by polling only every five minutes.
  Recent paid notifications marked `unsend` under the former limit can resume if
  they still have attempts remaining; accepted or suppressed channels stay excluded.
- Chart-worker deadlines cancel availability HTTP requests and stop further
  station/class probes. Late results are fenced from updating an expired attempt.
- The primary chart result is sent without waiting for alternate-train searches;
  the existing background alternative-search queue handles those separately.
- Cron logs report failed task/channel outcomes instead of marking them green.

## Tests

```sh
# Backend unit tests
npm --prefix backend test -- --runInBand

# Frontend unit / HTTP payload tests
npm run test:unit

# Desktop and mobile paid/free table-row flows; all write APIs mocked
npx playwright test e2e/chart-alert-schedule.spec.ts --project=chromium --project=mobile-chrome --workers=1
```

The PostgreSQL integration suite is opt-in via `NOTIFICATION_TEST_DATABASE_URL`.
It rejects non-local hosts, scopes fixtures to test IDs, and rolls back all writes.
Run it against a migrated local database:

```sh
NOTIFICATION_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/railchart \
  npm --prefix backend test -- --runInBand chart-notification.integration.spec.ts
```

## Rollout

Initial scheduling verification on 29 September 2026: 501 backend unit tests, 5 local PostgreSQL
integration tests, 34 frontend unit tests, and 8 Chromium desktop/mobile browser
tests passed. Backend production typechecking, Prisma validation, and lint on all
changed source/test files passed. Repository-wide frontend lint and typechecking
still report pre-existing issues outside this change (including older E2E files
and unrelated UI/worktree code).

The paid-retry policy update passed 64 targeted unit tests and 11 PostgreSQL
integration tests, including the eight-retry boundary, five-minute eligibility,
confirmed payment status, channel suppression, and selection before pagination.

Apply migrations `20260929200000_chart_notification_state` and
`20260929201000_notification_chart_event` before running the new backend. Deploy
the frontend snapshot submission first, or coordinate both releases, since the
new backend rejects subscriptions without chart-time fields. Older browser tabs
need a reload if they submit the old payload.

Existing incorrect task timestamps and paid requests with missing snapshots are
not automatically guessed or replayed by these migrations. They need a separate
review against the originally selected chart times. Provider delivered/read
receipt ingestion also remains separate from provider-acceptance tracking.
