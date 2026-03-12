-- CreateTable
CREATE TABLE "AvailabilityCheck" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "train_number" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "class_code" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "AvailabilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityCheck_job_id_key" ON "AvailabilityCheck"("job_id");

-- CreateIndex
CREATE INDEX "AvailabilityCheck_job_id_idx" ON "AvailabilityCheck"("job_id");
