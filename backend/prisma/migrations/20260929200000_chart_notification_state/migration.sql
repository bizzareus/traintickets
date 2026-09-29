ALTER TABLE "ChartTimeAvailabilityTask"
  ADD COLUMN "chart_number" INTEGER,
  ADD COLUMN "email_status" TEXT,
  ADD COLUMN "email_retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notification_last_attempt_at" TIMESTAMP(3);
