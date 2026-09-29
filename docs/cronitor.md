# Cronitor setup and monitoring coverage

**Status: configured but unverified.** The official `cronitor` JavaScript SDK is
installed in the NestJS backend. No account key was available in the environment
during setup, so remote resources, alert recipients, and real runtime events have
not been verified. A successful telemetry HTTP response alone does not verify
authentication: Cronitor deliberately returns 200 even for invalid ping keys.

## Where to see runs

- Cronitor's Jobs dashboard will show starts, completions, failures, duration,
  counts, and missing-run incidents after activation below.
- `/admin/cron-runs` already shows chart-notification ticks stored in Supabase.
  `cron_run_log` also contains alternative-search, resend, and daily refund runs;
  `best_seats_cron_run` holds cache-warming summaries. Docker logs and Sentry remain
  the source for stack traces and task-level diagnostics.

## Activate from the backend environment

1. In Cronitor API Settings, obtain an SDK Integration key, or keys with
   `monitor:read`, `monitor:write`, and `monitor:telemetry` scopes. Store it as
   `CRONITOR_API_KEY` in the backend's environment/secret manager. Never use a
   `NEXT_PUBLIC_*` variable or commit a key. A separately supplied
   `CRONITOR_MANAGEMENT_API_KEY` can handle setup while runtime uses a telemetry-only
   key.
2. Set `CRONITOR_ENVIRONMENT=production` for production, or use the existing
   `NODE_ENV` default. Local environments default to `development`; tests never ping.
3. Run these **from `backend/`, using the same feature flags as the deployed
   backend**:

   ```sh
   npm run cronitor:plan
   npm run cronitor:status
   npm run cronitor:sync
   ```

   `plan` is offline. `status` is read-only. `sync` reads all intended stable keys
   before upserting job configuration and reads it back afterward. Existing
   recipients, names, notes, groups, pauses, and custom assertions are preserved.
   Existing custom assertions can be stricter than the baseline; review them in
   Cronitor when changing thresholds. A conflicting monitor type or account-limit
   error stops setup; no monitor is deleted or renamed to bypass a limit.
4. Check the account's **default notification list** in Cronitor Settings → Alerts.
   New monitors inherit it. Existing monitors keep their routing. Recommended:
   the operations owner's email plus an existing team incident/Slack destination.
   The application does not create notification destinations or public status pages.
5. Restart/deploy the backend with the key. Wait for the real scheduled jobs, then
   run `npm run cronitor:status` and check the selected environment in Cronitor.
   Verify `initialized`, recent `run → complete/fail` events, and the expected host.
   Do not test by running production refunds, resending customer alerts, or sending
   setup-session pings.

Telemetry is enabled when a key is present, unless `CRONITOR_ENABLED=false`.
`CRONITOR_TIMEOUT_MS` is bounded to 100–5000 ms (default 2000). Telemetry outages
cannot fail a job or delay the start of its business operation. Terminal telemetry
is awaited with that timeout so events stay ordered. Disable telemetry with
`CRONITOR_ENABLED=false` and restart; pause the corresponding Cronitor monitors
separately to avoid expected missing-run alerts.

## Implemented backend monitors

Keys are prefixed `lastberth-`. All seven handlers are instrumented; provisioning
omits feature-gated jobs that are disabled in the environment used by `sync`.

| Key suffix | Actual schedule | Missing-run grace | Duration assertion (before grace) | Failure signal |
| --- | --- | --- | --- | --- |
| `chart-notification` | Every minute, second 0 | 2 min | Chart deadline + 2 min (6 min default) | Failed tasks or failed email/WhatsApp channel outcomes |
| `alternative-search` | Every minute, second 20 | 3 min | 15 min | Rejected background searches, including failures caught by the batch processor |
| `failed-notification-resend` | Every minute, second 40 | 3 min | 10 min | Failed or partially failed recovery attempts |
| `failed-delivery-refund` | Daily 09:00 IST | 10 min | 60 min | Refund or explanatory-email failures |
| `seat-cache` | Daily 03:30 IST | 10 min | 2 hours | Failed routes, even if the overall pass resolves normally |
| `wasender-healthcheck` | Every 30 minutes | 5 min | 5 min | Provider health result is unhealthy, even if no exception was thrown |
| `irctc-session-keeper` | Every 30 minutes; actual automatic boot harvests also report | 20 min | 4 min | Cookie harvest/persistence throws |

Daily schedules explicitly use `Asia/Kolkata`. The IRCTC keeper uses `TZ`, or UTC
when absent. `FAILED_DELIVERY_REFUND_CRON`, `IRCTC_KEEPER_CRON`, and
`CHART_TASK_DEADLINE_SECONDS` overrides are included in the generated plan.
Nest's fixed second fields are represented as five-field Cronitor schedules with
grace for seconds 20/40. Sub-minute custom expressions require a separately chosen
monitor schedule and are rejected by the configuration command.

Cronitor also adds `grace_seconds` to maximum-duration assertions. Explicit
`fail` events are immediate with the configured zero failure tolerance; grace
only affects missing-run and duration evaluation.

Enable the optional jobs using their existing switches:

- Seat cache: enabled outside development unless `SEAT_CACHE_ENABLED` is off.
- WhatsApp health: `WASENDER_HEALTHCHECK_ENABLED=true`.
- Cookie keeper: `IRCTC_KEEPER_ENABLED=true` plus its existing browser configuration.

Disabled jobs, standby replicas, overlapping skipped ticks, and lost cookie-harvest
claims do not emit synthetic successes. Idle scans that actually check the queue
are healthy and report count 0. No monitor asserts that work must exist every minute.
An older active invocation remains detectable by its duration even if later idle
ticks complete. Repeated slow/busy minute jobs may need tolerance tuning after
observing their actual duration distribution.

## What is sent

Actual job executions use SDK `Monitor.ping` with `run`, then `complete` or `fail`.
Each invocation has a unique `series` identifier to correlate overlapping runs.
Only stable monitor keys, environment, hostname, duration, numeric counts, and
generic failure text are sent. Recipient addresses, mobile numbers, PNRs, payment
payloads, cookies, raw exception messages, and command output are not included.

Explicit pings are used rather than `cronitor.wrap`: the installed SDK's wrapper
swallows callback exceptions and does not recognize returned business failures.
Our wrapper preserves return values/errors and summarizes those failures explicitly.
The SDK's Axios errors are stripped of request/config data before its own error
logger sees them, preventing telemetry URLs or API keys from entering logs.

## Recommended next monitoring changes (not provisioned here)

1. **External uptime:** add checks for `https://api.lastberth.com/api/health` and
   `https://lastberth.com/api/health`, every minute. Assert HTTP 200, `status=ok`
   where present, reasonable response time, and certificate validity. These detect
   DNS/TLS/proxy/app failures independently of the backend. The backend health
   endpoint currently proves process liveness, not Supabase readiness.
2. **Alert timeliness:** add a separate database-backed check for eligible overdue
   chart tasks and aged unsent paid notifications. A successful empty cron tick is
   not proof that every subscriber received an alert. Filter unsubscribed,
   suppressed, and intentionally deferred tasks before alerting on backlog.
3. **GitHub chart-time sync:** `.github/workflows/sync-chart-times.yml` is scheduled
   at `0 */6 * * *` UTC, with a 45-minute job timeout. Use Cronitor's GitHub Actions
   integration and a GitHub secret to observe the actual workflow result. Suggested
   grace: 30 minutes; duration limit: 50 minutes. The backend key does not instrument
   this separate runner automatically.
4. **AWS seat-cache pipeline:** Terraform declares an EventBridge producer at
   `21:30 UTC` (03:00 IST) and SQS consumers. Confirm it is deployed and enabled,
   then monitor producer completion, queue age/DLQ messages, and completed cache
   writes. Keep it separate from the NestJS 03:30 IST cache warmer; producer success
   alone cannot establish consumer success.
5. **Financial and delivery outcomes:** alert on aged `INITIATED` refunds and
   provider-confirmed message delivery failures. `sent` currently means provider
   acceptance, not delivered/read or bank settlement. Keep Sentry for stack traces
   and PostHog for product analytics; Cronitor RUM would duplicate existing tooling.

Commented-out Reddit and chart-ingestion decorators are not active cron jobs and
should not receive scheduled monitors. Account inventory, effective recipients,
GitHub execution health, and live AWS deployment state remain unverified until the
relevant authenticated environments are available.

References: [agent quickstart](https://cronitor.io/docs/agent-quickstart.md),
[JavaScript SDK](https://github.com/cronitorio/cronitor-js),
[job monitoring](https://cronitor.io/docs/cron-job-monitoring.md),
[API scopes](https://cronitor.io/docs/api.md).
