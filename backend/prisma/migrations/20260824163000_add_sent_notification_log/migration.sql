-- CreateTable
CREATE TABLE "sent_notification_log" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "notification_type" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sent_notification_log_recipient_train_number_journey_date_notification_type_sent_at_idx" ON "sent_notification_log"("recipient", "train_number", "journey_date", "notification_type", "sent_at");
