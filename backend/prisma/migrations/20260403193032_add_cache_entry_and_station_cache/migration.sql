/*
  Warnings:

  - Made the column `name` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Made the column `password_hash` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
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

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "password_hash" SET NOT NULL;

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

-- CreateTable
CREATE TABLE "cache_entry" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_entry_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "station_cache" (
    "station_code" TEXT NOT NULL,
    "station_name" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "station_cache_pkey" PRIMARY KEY ("station_code")
);

-- CreateIndex
CREATE INDEX "MonitoringRequest_train_id_station_code_journey_date_status_idx" ON "MonitoringRequest"("train_id", "station_code", "journey_date", "status");

-- CreateIndex
CREATE INDEX "BrowserExecution_job_id_idx" ON "BrowserExecution"("job_id");

-- CreateIndex
CREATE INDEX "AlertLog_monitoring_request_id_idx" ON "AlertLog"("monitoring_request_id");

-- CreateIndex
CREATE INDEX "cache_entry_expires_at_idx" ON "cache_entry"("expires_at");

-- CreateIndex
CREATE INDEX "station_cache_station_name_idx" ON "station_cache"("station_name");

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
