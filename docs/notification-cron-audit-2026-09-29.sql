-- Read-only audit. UTC-valued timestamp-without-time-zone columns must be
-- interpreted as UTC before converting to IST. Change this cutoff for a new audit.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL audit.cutoff = '2026-09-29 17:56:37';

-- 1. Latest 50 scheduler ticks, including idle ticks.
WITH recent AS (
  SELECT * FROM cron_run_log
  WHERE cron_name = 'chart-notification'
    AND started_at <= current_setting('audit.cutoff')::timestamp
  ORDER BY started_at DESC, id DESC
  LIMIT 50
)
SELECT id,
  started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS started_ist,
  extract(epoch FROM started_at - lag(started_at) OVER (ORDER BY started_at, id)) AS gap_seconds,
  input ->> 'istNow' AS recorded_ist,
  status, duration_ms, tasks_claimed, tasks_run, completed_count, failed_count, error
FROM recent
ORDER BY started_at DESC, id DESC;

-- 2. Latest 50 ticks that actually processed tasks. Retries can repeat task IDs.
SELECT id,
  started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS started_ist,
  status, duration_ms, tasks_claimed, tasks_run, completed_count, failed_count,
  input -> 'claimedTaskIds' AS task_ids, output, error
FROM cron_run_log
WHERE cron_name = 'chart-notification' AND tasks_run > 0
  AND started_at <= current_setting('audit.cutoff')::timestamp
ORDER BY started_at DESC, id DESC
LIMIT 50;

-- 3. Latest 50 distinct task records by recorded first execution.
-- Per-task send flags are not provider delivery receipts. Historical first_run_at
-- may reflect a rerun: use cron_run_log for the recorded attempts as well.
WITH recent AS (
  SELECT * FROM "ChartTimeAvailabilityTask"
  WHERE first_run_at <= current_setting('audit.cutoff')::timestamp
  ORDER BY first_run_at DESC, id DESC
  LIMIT 50
), audit AS (
  SELECT t.*,
    NULLIF(trim(c.email), '') IS NOT NULL AS has_email,
    NULLIF(trim(c.mobile), '') IS NOT NULL AS has_mobile,
    extract(epoch FROM t.first_run_at - greatest(t.chart_at, t.created_at)) AS pickup_seconds,
    extract(epoch FROM t.email_notified_at - greatest(t.chart_at, t.created_at)) AS email_seconds,
    extract(epoch FROM t.whatsapp_notified_at - greatest(t.chart_at, t.created_at)) AS whatsapp_seconds,
    EXISTS (
      SELECT 1 FROM sent_notification_log s
      WHERE s.train_number = t.train_number AND s.journey_date = t.journey_date
        AND s.channel = 'email' AND s.recipient = lower(trim(c.email))
        AND s.sent_at <= current_setting('audit.cutoff')::timestamp
    ) AS journey_has_email_send_record,
    EXISTS (
      SELECT 1 FROM sent_notification_log s
      WHERE s.train_number = t.train_number AND s.journey_date = t.journey_date
        AND s.channel = 'whatsapp' AND s.recipient = trim(c.mobile)
        AND s.sent_at <= current_setting('audit.cutoff')::timestamp
    ) AS journey_has_whatsapp_send_record
  FROM recent t
  LEFT JOIN "JourneyMonitorContact" c ON c.journey_request_id = t.journey_request_id
)
SELECT id, journey_request_id, train_number, from_station_code, to_station_code,
  journey_date, train_start_date,
  chart_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS chart_ist,
  created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS subscribed_ist,
  first_run_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS first_run_ist,
  completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS completed_ist,
  email_notified_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS email_flag_ist,
  whatsapp_notified_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS whatsapp_flag_ist,
  status, retry_count, last_error, has_email, has_mobile,
  whatsapp_status, whatsapp_retry_count,
  created_at > chart_at AS subscribed_after_chart,
  round(pickup_seconds, 3) AS pickup_seconds_after_eligible,
  round(email_seconds, 3) AS email_seconds_after_eligible,
  round(whatsapp_seconds, 3) AS whatsapp_seconds_after_eligible,
  journey_has_email_send_record, journey_has_whatsapp_send_record,
  count(*) OVER () AS sample_tasks,
  count(*) FILTER (WHERE status = 'completed') OVER () AS completed_tasks,
  count(*) FILTER (WHERE status = 'failed') OVER () AS failed_tasks,
  count(*) FILTER (WHERE has_email) OVER () AS email_eligible_tasks,
  count(*) FILTER (WHERE has_email AND email_notified_at IS NOT NULL) OVER () AS email_flagged_sent_tasks,
  count(*) FILTER (WHERE has_mobile) OVER () AS whatsapp_eligible_tasks,
  count(*) FILTER (WHERE has_mobile AND whatsapp_notified_at IS NOT NULL) OVER () AS whatsapp_flagged_sent_tasks,
  count(*) FILTER (WHERE pickup_seconds <= 60) OVER () AS pickup_within_60s_tasks
FROM audit
ORDER BY first_run_at DESC, id DESC;

-- 4. Latest 50 send-log entries. Recipients omitted intentionally.
SELECT id, channel, train_number, journey_date, notification_type,
  sent_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS sent_ist
FROM sent_notification_log
WHERE sent_at <= current_setting('audit.cutoff')::timestamp
ORDER BY sent_at DESC, id DESC
LIMIT 50;

-- 5. Apparent overdue tasks, with reasons they may not be eligible for pickup.
SELECT t.id, t.train_number, t.status, t.retry_count, t.completed_at, t.next_run_at,
  t.chart_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS chart_ist,
  EXISTS (
    SELECT 1 FROM notification_unsubscribe nu
    WHERE nu.recipient = lower(trim(c.email)) OR nu.recipient = trim(c.mobile)
  ) AS unsubscribed,
  t.last_error
FROM "ChartTimeAvailabilityTask" t
LEFT JOIN "JourneyMonitorContact" c ON c.journey_request_id = t.journey_request_id
WHERE t.status IN ('pending', 'running')
  AND t.chart_at <= current_setting('audit.cutoff')::timestamp
ORDER BY t.chart_at, t.id;

ROLLBACK;
