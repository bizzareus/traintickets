-- CreateEnum
CREATE TYPE "MonitoringRequestStatus" AS ENUM ('scheduled', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "BrowserExecutionType" AS ENUM ('availability');

-- CreateEnum
CREATE TYPE "BrowserExecutionStatus" AS ENUM ('pending', 'running', 'success', 'failed');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('whatsapp', 'call', 'push');

-- CreateEnum
CREATE TYPE "AlertLogStatus" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Train" (
    "id" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "train_name" TEXT NOT NULL,
    "origin_station" TEXT NOT NULL,
    "destination_station" TEXT NOT NULL,
    "departure_time" TEXT,
    "arrival_time" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Train_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartRule" (
    "id" TEXT NOT NULL,
    "train_id" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "chart_time_local" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChartRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartEventInstance" (
    "id" TEXT NOT NULL,
    "train_id" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "chart_timestamp" TIMESTAMP(3) NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "executed_at" TIMESTAMP(3),

    CONSTRAINT "ChartEventInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRequest" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "train_id" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "class_code" TEXT NOT NULL,
    "status" "MonitoringRequestStatus" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserExecution" (
    "id" TEXT NOT NULL,
    "monitoring_request_id" TEXT NOT NULL,
    "chart_event_instance_id" TEXT NOT NULL,
    "job_id" TEXT,
    "type" "BrowserExecutionType" NOT NULL DEFAULT 'availability',
    "status" "BrowserExecutionStatus" NOT NULL DEFAULT 'pending',
    "result_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "BrowserExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL,
    "monitoring_request_id" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "status" "AlertLogStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Train_train_number_key" ON "Train"("train_number");

-- CreateIndex
CREATE INDEX "ChartEventInstance_chart_timestamp_executed_idx" ON "ChartEventInstance"("chart_timestamp", "executed");

-- CreateIndex
CREATE INDEX "ChartEventInstance_train_id_station_code_journey_date_idx" ON "ChartEventInstance"("train_id", "station_code", "journey_date");

-- CreateIndex
CREATE INDEX "MonitoringRequest_train_id_station_code_journey_date_status_idx" ON "MonitoringRequest"("train_id", "station_code", "journey_date", "status");

-- CreateIndex
CREATE INDEX "BrowserExecution_job_id_idx" ON "BrowserExecution"("job_id");

-- CreateIndex
CREATE INDEX "AlertLog_monitoring_request_id_idx" ON "AlertLog"("monitoring_request_id");

-- AddForeignKey
ALTER TABLE "ChartRule" ADD CONSTRAINT "ChartRule_train_id_fkey" FOREIGN KEY ("train_id") REFERENCES "Train"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartEventInstance" ADD CONSTRAINT "ChartEventInstance_train_id_fkey" FOREIGN KEY ("train_id") REFERENCES "Train"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRequest" ADD CONSTRAINT "MonitoringRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRequest" ADD CONSTRAINT "MonitoringRequest_train_id_fkey" FOREIGN KEY ("train_id") REFERENCES "Train"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserExecution" ADD CONSTRAINT "BrowserExecution_monitoring_request_id_fkey" FOREIGN KEY ("monitoring_request_id") REFERENCES "MonitoringRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserExecution" ADD CONSTRAINT "BrowserExecution_chart_event_instance_id_fkey" FOREIGN KEY ("chart_event_instance_id") REFERENCES "ChartEventInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLog" ADD CONSTRAINT "AlertLog_monitoring_request_id_fkey" FOREIGN KEY ("monitoring_request_id") REFERENCES "MonitoringRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
