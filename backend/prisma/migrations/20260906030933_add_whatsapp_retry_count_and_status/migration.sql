-- AlterTable
ALTER TABLE "ChartTimeAvailabilityTask" ADD COLUMN     "whatsapp_retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsapp_status" TEXT;
