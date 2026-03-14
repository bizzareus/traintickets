-- Ensure JourneyMonitorContact exists (idempotent for DBs where migration was applied but table missing)
CREATE TABLE IF NOT EXISTS "JourneyMonitorContact" (
    "id" TEXT NOT NULL,
    "journey_request_id" TEXT NOT NULL,
    "email" VARCHAR(255),
    "mobile" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyMonitorContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JourneyMonitorContact_journey_request_id_key" ON "JourneyMonitorContact"("journey_request_id");
CREATE INDEX IF NOT EXISTS "JourneyMonitorContact_journey_request_id_idx" ON "JourneyMonitorContact"("journey_request_id");
