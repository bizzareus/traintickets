# Seat availability cache

## Freshness versus retention

DynamoDB retains snapshots for 48 hours for cleanup, but readers enforce a
separate `freshUntil` deadline:

| Journey date (IST) | Maximum snapshot age |
| ------------------ | -------------------- |
| Today              | 10 minutes           |
| Next 1–7 days      | 1 hour               |
| Later              | 6 hours              |

Freshness also expires at IST midnight so a changing travel horizon cannot
extend a snapshot's validity. Reading or warming from an existing cache never
resets its upstream timestamp. Stale entries are cache misses; if upstream is
unavailable, search fails rather than claiming old seats are available.
Pre-checkout availability validation remains separate from discovery caching.

## Warming

- The Nest worker runs at **03:30 IST**. Its canonical target file is
  `backend/data/train-cache-targets.json`, copied into the backend runtime image.
  A missing or empty file fails the job and is reported through existing cron
  monitoring rather than silently skipping all configured train targets.
- Configured premium/festival windows and the nine curated corridors remain.
  PostHog additionally supplies the top **50 future route/date pairs** from
  frontend `search_tickets_clicked` events over the preceding **7 days**.
  Those dates are warmed directly, without a Cartesian expansion.
- The EventBridge/SQS Lambda pipeline runs at **03:00 IST**. Producer tasks
  are deduplicated by route/date. The worker calls authenticated
  `POST /api/admin/seat-cache/warm-route` to force an upstream refresh; it no
  longer fetches the public cached search endpoint or writes fabricated
  availability/fallback classes to DynamoDB.
- Failed Lambda records are returned through SQS partial-batch failure reporting.
  The backend still batches DynamoDB writes asynchronously; a successful warm
  request means upstream succeeded and persistence was enqueued, not that every
  background DynamoDB write has been confirmed. Check write-error logs too.

## Safe rollout

1. Set a strong `SEAT_CACHE_CRON_API_KEY` in the backend environment.
2. Supply the **same secret** as Terraform `seat_cache_cron_api_key` (for example,
   through `TF_VAR_seat_cache_cron_api_key` in the deployment environment).
   Terraform stores it in state, so protect the state and deployment logs.
3. Deploy the backend API and Nest worker **before** updating the Lambda.
   Verify the container contains `/app/data/train-cache-targets.json`.
4. Apply the reviewed Terraform plan for the Lambda secret, new worker code,
   batch size of one, and `ReportBatchItemFailures`. Do not deploy the Lambda
   without the secret: it intentionally fails rather than bypassing auth.
5. Deploy the frontend with the route-scoped seat reader. Old, unscoped seat
   records are deliberately ignored and expire naturally; no destructive purge
   or database migration is needed. Until a route is refreshed, the matrix
   displays "Check Available" rather than guessing availability.
6. Confirm the next Nest cron reports nonzero `targets_processed`, and inspect
   Lambda retries/DLQ and DynamoDB write errors before increasing coverage.

The per-train seat key is `trainNumber` +
`SEAT#FROM#TO#YYYY-MM-DD#CLASS`. Nearby-station alternatives retain their actual
boarding/destination codes. The confirmed-ticket page renders dynamically so
build-time or hourly ISR HTML cannot freeze its availability matrix.

## PostHog measurement

`seat_cache_search` now includes:

- `request_source`: `user`, `warmer`, or `internal`.
- `cache_layer`: `memory`, `queue`, `dynamodb`, or `none`.
- `cache_age_ms`, `miss_reason`, `coalesced`, and `success`.
- `duration_ms`: server search duration including cached split-path enrichment.

The public controller labels old `LastBerth-SeatCacheWorker/*` clients as
`warmer` for telemetry only. A user-agent does **not** grant refresh privileges.
Internal best-train searches do not count as frontend user searches.

For the existing performance dashboard, filter user-facing hit-rate and latency
charts to `request_source = user`; chart warming traffic separately. Keep older
events without this field as "unclassified", not as users. Do not compare the
old latency series (cache lookup/upstream only) directly with the new enriched
search duration without marking the rollout date. No dashboard was mutated by
the code change.

Useful post-rollout SQL (adjust the time window to exclude pre-rollout events):

```sql
SELECT properties.status AS status,
       count() AS requests,
       avg(toFloat(properties.duration_ms)) AS avg_ms,
       quantile(0.95)(toFloat(properties.duration_ms)) AS p95_ms
FROM events
WHERE event = 'seat_cache_search'
  AND timestamp >= now() - INTERVAL 7 DAY
  AND properties.request_source = 'user'
GROUP BY status
```
