-- CreateTable
CREATE TABLE "JourneyMonitorContact" (
    "id" TEXT NOT NULL,
    "journey_request_id" TEXT NOT NULL,
    "email" VARCHAR(255),
    "mobile" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyMonitorContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JourneyMonitorContact_journey_request_id_key" ON "JourneyMonitorContact"("journey_request_id");

-- CreateIndex
CREATE INDEX "JourneyMonitorContact_journey_request_id_idx" ON "JourneyMonitorContact"("journey_request_id");
