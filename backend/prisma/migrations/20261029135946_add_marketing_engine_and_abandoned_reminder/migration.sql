-- AlterTable
ALTER TABLE "split_ticket_booking" ADD COLUMN     "abandoned_reminder_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "marketing_engine_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "min_abandoned_minutes" INTEGER NOT NULL DEFAULT 15,
    "max_lookback_hours" INTEGER NOT NULL DEFAULT 48,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_engine_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "split_ticket_booking_payment_status_abandoned_reminder_sent_idx" ON "split_ticket_booking"("payment_status", "abandoned_reminder_sent_at", "created_at");
