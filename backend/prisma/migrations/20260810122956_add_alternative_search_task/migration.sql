-- CreateTable
CREATE TABLE "alternative_search_task" (
    "id" TEXT NOT NULL,
    "journey_task_id" TEXT,
    "train_number" TEXT NOT NULL,
    "train_name" TEXT,
    "from_station_code" TEXT NOT NULL,
    "to_station_code" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "class_code" TEXT NOT NULL DEFAULT '3A',
    "monitoring_contact_id" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_payload" JSONB,
    "notification_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "alternative_search_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alternative_search_task_status_created_at_idx" ON "alternative_search_task"("status", "created_at");
