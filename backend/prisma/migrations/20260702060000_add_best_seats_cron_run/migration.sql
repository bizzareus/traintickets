-- CreateTable
CREATE TABLE "best_seats_cron_run" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "due" INTEGER NOT NULL,
    "batch" INTEGER NOT NULL,
    "refreshed" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "routes" JSONB NOT NULL,
    "owner_id" TEXT,

    CONSTRAINT "best_seats_cron_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "best_seats_cron_run_started_at_idx" ON "best_seats_cron_run"("started_at");
