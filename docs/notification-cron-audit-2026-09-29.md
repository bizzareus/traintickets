# Notification cron audit: 29 September 2026

## Verdict

**IST conversion and the current minute scheduler are working. End-to-end notification timeliness, message-time accuracy, and delivery accounting do not meet the advertised instant-alert experience.**

Production was inspected through SSH on the backend EC2 instance, read-only SQL against its Supabase database, Docker logs, and read-only WASender API calls. The database audit cutoff was **29 September 2026, 23:26:37 IST** (`17:56:37 UTC`). Final WhatsApp receipt checks completed at **23:33:53 IST**.

The deployed image revision and local HEAD both identified `6aedee693aef87f8379bca0e5c85b44c5805c87d`. This audit made no production configuration/data changes, triggered no cron jobs, and sent no test messages. The email rejection reproduction used a mocked provider in a separate Node process.

## Requirements and measurement

- The product promises “Instant alert the moment the chart is prepared” in `components/payments/ChartAlertTrustFooter.tsx:14` and instant notifications in `components/home/TrainChartAlertSection.tsx:237`.
- The implemented scheduler polls every minute. A 60-second pickup window is an audit benchmark derived from that cadence, not a separately documented delivery SLA.
- Chart times should reflect IST, including train-start-date offsets and customer-selected pinned times.
- Only channels with a nonblank contact address are included in the channel denominators.
- Delivery requires provider evidence. Task completion, a send-log entry, provider acceptance, and a delivered/read receipt are different events.
- Timing statistics below measure from `greatest(chart_at, created_at)`. This avoids blaming the scheduler for a subscription created after its chart time. Historical `first_run_at` fields are task state, not immutable attempt history.

## Samples and results

Three different “last 50” samples were checked so idle ticks would not conceal failed alerts:

| Sample | Result |
| --- | --- |
| Latest 50 chart cron ticks | 29 Sep, 22:37–23:26 IST; all successful, all idle |
| Tick spacing | 59.906–60.098 seconds; no gap over 90 seconds |
| IST timestamp labels | All 50 agree with UTC-to-IST conversion |
| Latest 50 nonempty chart cron runs | 21–29 Sep; 66 task attempts, 39 completed results, 16 failed results, 11 other results |
| Misleading green runs | 9 of those 50 runs say `success` while containing failed tasks |
| Latest 50 distinct executed tasks | Recorded first execution 22 Sep 13:00 IST through 29 Sep 04:40:15 IST; 31 subscriptions |
| Task outcomes | 38 completed; 12 failed |
| Failure reasons | 7 exhausted 240-second timeout attempts; 5 “Journey date cannot be in the past” |
| Pickup within 60 seconds of eligibility | 36/50; median 1.210 seconds; maximum recorded delay 13h 53m 06s |
| Subscriptions created after chart time | 17 tasks |
| Email flags | 30/42 eligible tasks marked sent |
| WhatsApp flags | 24/47 eligible tasks marked sent |
| No send flag on either channel | 17 tasks, including 5 completed tasks |
| Latest 50 send-log entries | 28 email; 22 WhatsApp, spanning 22–28 Sep |

The 25 sampled tasks first recorded after the 25 September cron rearchitecture began running include **23 pickups within 60 seconds**, two longer recorded pickup delays, and seven failed tasks. These observations distinguish improvements in scheduling from continuing execution failures. Some historical first-run timestamps can represent later attempts; they should not be read as a full reconstruction of every original pickup.

At subscription level, rather than per chart task:

- 22/26 email-eligible subscriptions have at least one chart-result email send record.
- 22/28 WhatsApp-eligible subscriptions have at least one chart-result WhatsApp send record.
- **Six subscriptions have no chart-result send record on either channel; five were paid.** These checks exclude payment-confirmation messages. Recipient/train/journey-date matching is necessary because send logs have no task foreign key; it can also match another subscription for the same recipient/train/date.

### Recorded send latency

These are application send timestamps, not recipient delivery timestamps, and include processing and resend delay:

| Channel | Recorded sends | Median after eligibility | More than 5 minutes | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Email | 30 | 4m 59.802s | 15 | 7h 29m 49.406s |
| WhatsApp | 24 | 3m 32.634s | 10 | 4h 52m 55.906s |

## IST configuration: correct conversion, separate source-time concerns

- Container and database session timezone are UTC. The timestamp columns are PostgreSQL `timestamp without time zone`, holding UTC-valued timestamps.
- `buildChartAtWithDayOffset` explicitly constructs an `Asia/Kolkata` datetime and converts it to a JavaScript instant: `backend/src/availability/journey-task.service.ts:102`.
- The due query compares `chart_at` with `NOW() AT TIME ZONE 'utc'`: `journey-task.service.ts:2206`. This is correct for those columns.
- `EVERY_MINUTE` at `backend/src/chart-cron/chart-cron.service.ts:38` fires at second zero. An explicit IST cron timezone is not needed for this every-minute schedule.
- Alternative search runs at second 20 each minute; resend runs every five minutes at second 40. Production defaults are two chart workers and a 240-second task deadline, with a 90-second leader lease.

Of the 50 task schedules, 37 match today's train/station chart cache. Four more apparent cache mismatches are explained by the original payment payload's pinned chart times, which correctly match the tasks. Seven have no current station chart-cache row. Two remain unmatched to current cache; that is not proof of an original timezone error because the cache is mutable and is not versioned by journey date. For one of these, train 12665/BBS, the cache row was created after the task had already executed.

## Findings

### 1. High: failed processing prevents promised chart alerts

Task processing can fail even though the containing cron row is marked `success`. Seven sampled tasks exhausted the 240-second deadline; five older tasks failed after the journey date had passed. The five paid subscriptions without any chart-result send record are:

| Train | Journey request | Sampled task failure | Payment |
| --- | --- | --- | --- |
| 12665 | `62f49067-887d-4447-9b36-3ceeb2cf98e3` | 240-second timeout, three attempts | PAID, ₹10 |
| 18521 | `ccf8d6f7-5d30-4400-b3bf-cf07a24f03db` | Both chart tasks timed out | PAID, ₹10 |
| 22931 | `d829409c-69b6-4cb2-9d5c-b87e05ace48c` | Both chart tasks timed out | PAID, ₹10 |
| 12953 | `c5ef7125-6667-48c5-bf9b-76fad7cbac5d` | Both tasks failed with past journey date | PAID, ₹10 |
| 18117 | `d86b6e58-78a3-4006-8e35-21fd359c482b` | Both tasks failed with past journey date | PAID, ₹10 |

All five payment records had `refund_status = NONE` at inspection; this describes recorded state and does not assert that an automatic refund was contractually required. The sixth subscription, train 20605, completed its check but has `whatsapp_status = unsend`, three notification retries, no email address, and no matching WASender message log. A read-only WASender registration check returned `exists: false` for that contact at audit time. This supports an invalid/non-WhatsApp recipient explanation; it is not a historical receipt for the failed attempts.

Example: task `70f92100-cc1e-4a6e-993a-6866ff6e9431` was due **29 Sep 04:40 IST**, first recorded running at **04:40:15**, and failed at **05:08:10** after three attempts. Neither channel has a chart-result send record. This is an execution failure, not a 5h 30m timezone shift.

The existing resend query only selects completed tasks, so these failed checks are outside notification recovery (`journey-task.service.ts:2620`). The current Docker log retention does not cover their execution, so the upstream cause of each historical timeout was not established.

### 2. High: email API rejections are incorrectly marked successful

`backend/src/notification/notification.service.ts:198` awaits `resend.emails.send()` and returns `true` without inspecting its `{ data, error }` response. A reproduction against the deployed class with a mocked `{ data: null, error: { statusCode: 422, ... } }` response returned **true**. No real email was sent during this reproduction.

Consequently, the 30 email flags are **not reliable evidence even of provider acceptance**. A rejected response can also create a deduplication log and prevent a genuine retry.

An attempted read of Resend's email history returned HTTP 401: **“This API key is restricted to only send emails.”** Actual email acceptance/delivery remains unverified. Completing that part requires Resend dashboard/history access or a read-capable credential.

### 3. High: actual WhatsApp messages can display a different chart time

Provider message content confirms these examples:

| Task | Saved schedule / send time (IST) | Actual message text |
| --- | --- | --- |
| `f661360b-5578-4afa-98d3-1a8017dc339a`, train 12166 | 26 Sep 05:27 / 05:27:45 | “prepared at 1:41 PM” |
| `5d630e13-1554-45cd-8169-ba9255fd754e`, train 11077 | 24 Sep 07:59 / 07:59:59 | “prepared at 1:35 PM” |
| `69c0a072-518b-4b7c-b8b5-c9e9f5e50691`, train 19325 | Second chart, 23 Sep 01:20 / 01:26:03 | “1st Chart … prepared at 5:35 PM” |
| `bcb50586-f912-43cd-8739-8b23806ed6cf`, train 22945 | Second chart, 28 Sep 00:52 / 01:00:43 | “Chart Alert : 3:31 PM” |

For the first two, the payment payload explicitly pinned the saved task time. The outgoing message instead reads current chart metadata before falling back to `task.chartAt` (`notification.service.ts:945–982`). Second-chart formatting also anchors metadata offsets to the boarding journey date rather than the train-start date (`:957`), which is wrong for some overnight routes. The resend path omits `chartAt` and `trainStartDate` when reconstructing the notification task (`journey-task.service.ts:2676`).

The remedy should use the immutable scheduled chart event as the source for message date, time, and chart number, including on resend. A current cache value is not the same evidence as the event the customer subscribed to.

### 4. High: “WhatsApp sent” is not “delivered”

All **24** WhatsApp send flags in the task sample were matched to **24 unique WASender messages**, using normalized recipient, train number, and a unique provider creation timestamp within 10 seconds of the DB flag. Nearby subscription-confirmation messages were excluded.

Individual `/api/messages/{msgId}/info` responses reported:

| WASender status | Count | Interpretation |
| --- | ---: | --- |
| 2: SENT | 16 | No delivered/read receipt confirmed by the queried status |
| 3: DELIVERED | 6 | Reached recipient device |
| 4: READ | 2 | Recipient read receipt |

Thus **8/24 have delivered-or-read confirmation**. The other 16 must not be counted as delivered; a stale/missing receipt is also possible, so this does not prove all 16 were physically undelivered. These are receipt states at audit time, not measured delivery latencies.

The app discards the provider message ID and records success on an HTTP-successful send (`backend/src/notification/whatsapp-providers/wasender.provider.ts:58–74`). Its WhatsApp webhook handles incoming messages, not persisted delivery receipts (`backend/src/whatsapp/whatsapp.controller.ts:51–106`).

### 5. Medium: suppression and retry states conflate different outcomes

- Four completed tasks with neither channel flag have earlier matching train/date send records, consistent with the explicit follow-up suppression in `journey-task.service.ts:1843–1875`. These are not four proven initial-alert failures.
- Seven tasks are marked WhatsApp `unsend`; six have an earlier matching WhatsApp send record. Duplicate suppression leaves `whatsappSent = false`, and the retry path treats that as a failure and consumes retries (`notification.service.ts:908–920`, `journey-task.service.ts:2694–2708`). Provider logs support successful earlier sends for those journeys.
- Failed WhatsApp retries can stop after three suppressed attempts while email retries continue. When the deduplication window expires, email can be sent hours later. This is consistent with observed multi-hour email timestamps, but historical attempt-level provider errors are not available for every case.
- The resend lookback uses **subscription creation time**, not completion/failure time (`journey-task.service.ts:2622`). A subscription purchased more than 24 hours in advance can be excluded when its chart alert eventually fails.
- `whatsappStatus: { not: 'unsend' }` does not include SQL NULL values. Some older tasks have NULL status and no WhatsApp timestamp, and can be omitted from the WhatsApp retry branch.
- Follow-up suppression and the resend path use different rules. The main path may skip a second-chart alert, while the resend path sends it later. Whether both charts should notify needs an explicit product decision; the current behavior is inconsistent.

### 6. Monitoring and historical-state gaps

- The current backend container started at **29 Sep 18:08:31 IST**. Available Docker output begins at 18:08:37 IST. The log snapshot contains 10,456 lines and 318 chart cron starts, zero due chart-task executions, and no observed cron-query/leadership/logging errors.
- One successful WhatsApp provider send and three email send attempts appeared in that container's logs; these are not evidence for the older 50-task cohort. Previous containers are absent from `docker ps -a`, so their Docker logs were unavailable through this inspection.
- The latest 50 resend ticks were successful but selected zero tasks. That does not mean historical failures were recovered.
- Thirteen rows appear overdue and pending: twelve are unsubscribed, and one has both `status = pending` and a non-null `completed_at`. The latter is deliberately excluded by the pickup predicate, so it is inconsistent historical state rather than evidence of an eligible active backlog.
- No audited task was excluded as unsubscribed. The backlog figures are separate from the 50 executed tasks.

## Prioritized recommendations

1. **Make results truthful:** inspect Resend errors, retain provider message IDs, and persist independent per-channel accepted/delivered/read/failed/suppressed states.
2. **Fix message-time accuracy:** use the saved chart event and train-start date for initial sends and retries; preserve chart number explicitly.
3. **Recover actual failures:** investigate the bounded worker's upstream timeouts, add a terminal-failure/customer notification path, and base delivery retries on attempt/completion time rather than purchase time.
4. **Separate suppression from failure:** record why a notification was skipped; do not burn retries or report `unsend` for an intentional deduplication decision. Make first/second-chart policy consistent.
5. **Monitor customer outcomes:** distinguish cron tick health, task success, and provider delivery; keep logs across container replacement and link task IDs to provider IDs.

## Reproduction

Run `docs/notification-cron-audit-2026-09-29.sql` against Supabase. It is a read-only transaction with five result sets: latest ticks, latest active ticks, latest executed tasks with summary counts, latest sends, and apparent backlog. Database tools that show only the last result set may require running each SELECT after the transaction setup separately.

The cutoff fixes sample selection, not historical row versions. Later retries or state edits can change task fields; the report above captures the observed audit-time values. Provider receipts must be queried separately. Neither raw contact details nor credentials are included in these artifacts.

### Provider receipt evidence

Task IDs are shortened here; the SQL returns full IDs. Receipt states were queried at audit time and can change later.

| Task prefix | Train | WASender message ID | Receipt state |
| --- | --- | --- | --- |
| `c7616aab` | 12665 | 83530273 | READ |
| `3d8fb0ad` | 22940 | 83502343 | SENT |
| `68ec974d` | 18449 | 83475169 | SENT |
| `08ad0a1f` | 18449 | 83443845 | SENT |
| `bcb50586` | 22945 | 83359805 | SENT |
| `0d68d4e8` | 16588 | 83311460 | SENT |
| `d4fcebd1` | 22945 | 83265355 | SENT |
| `dfd1186b` | 12478 | 83248815 | DELIVERED |
| `422e7c7c` | 20819 | 83247366 | SENT |
| `b3b1a52b` | 22666 | 83210302 | READ |
| `21b4336a` | 22157 | 83133364 | DELIVERED |
| `65f66a68` | 16525 | 83111947 | SENT |
| `f661360b` | 12166 | 82966026 | SENT |
| `67734259` | 12833 | 82678307 | SENT |
| `aeceaffc` | 12166 | 82675289 | SENT |
| `619d2a99` | 11014 | 82644179 | SENT |
| `c6170534` | 11014 | 82613616 | DELIVERED |
| `79c05da5` | 16308 | 82613171 | DELIVERED |
| `5d630e13` | 11077 | 82391107 | SENT |
| `69c0a072` | 19325 | 82008502 | DELIVERED |
| `bb0e01b4` | 20155 | 81987264 | SENT |
| `913a610e` | 19325 | 81986850 | DELIVERED |
| `c56275c9` | 22582 | 81880168 | SENT |
| `82c8e7b9` | 16344 | 81817173 | SENT |

WASender references: [message logs](https://wasenderapi.com/api-docs/sessions/get-message-logs), [message status meanings](https://wasenderapi.com/api-docs/messages/get-message-info).
