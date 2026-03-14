-- CreateTable
CREATE TABLE "MonitoringContact" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255),
    "mobile" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyMonitoringRequest" (
    "id" TEXT NOT NULL,
    "monitoring_contact_id" TEXT,
    "train_number" TEXT NOT NULL,
    "from_station_code" TEXT NOT NULL,
    "to_station_code" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "class_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyMonitoringRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringContact_email_key" ON "MonitoringContact"("email");

-- CreateIndex
CREATE INDEX "MonitoringContact_email_idx" ON "MonitoringContact"("email");

-- CreateIndex
CREATE INDEX "MonitoringContact_mobile_idx" ON "MonitoringContact"("mobile");

-- CreateIndex
CREATE INDEX "JourneyMonitoringRequest_monitoring_contact_id_idx" ON "JourneyMonitoringRequest"("monitoring_contact_id");

-- CreateIndex
CREATE INDEX "JourneyMonitoringRequest_train_number_journey_date_idx" ON "JourneyMonitoringRequest"("train_number", "journey_date");

-- AddForeignKey
ALTER TABLE "JourneyMonitoringRequest" ADD CONSTRAINT "JourneyMonitoringRequest_monitoring_contact_id_fkey" FOREIGN KEY ("monitoring_contact_id") REFERENCES "MonitoringContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
