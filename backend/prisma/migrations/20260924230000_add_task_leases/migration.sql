ALTER TABLE "ChartTimeAvailabilityTask"
ADD COLUMN IF NOT EXISTS "lease_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "alternative_search_task"
ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lease_version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "alternative_search_task_status_locked_at_idx"
ON "alternative_search_task"("status", "locked_at");
