-- CreateTable
CREATE TABLE "cron_run_log" (
    "id" TEXT NOT NULL,
    "cron_name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL,
    "is_leader" BOOLEAN NOT NULL DEFAULT false,
    "tasks_claimed" INTEGER NOT NULL DEFAULT 0,
    "tasks_run" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_run_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cron_run_log_cron_name_started_at_idx" ON "cron_run_log"("cron_name", "started_at");
