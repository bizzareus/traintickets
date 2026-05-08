ALTER TABLE "ChartTimeAvailabilityTask"
ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "next_run_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "last_error" TEXT;

CREATE INDEX IF NOT EXISTS "ChartTimeAvailabilityTask_status_next_run_at_locked_at_idx"
ON "ChartTimeAvailabilityTask"("status", "next_run_at", "locked_at");
