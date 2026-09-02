-- CreateTable
CREATE TABLE "notification_unsubscribe" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'all',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_unsubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_unsubscribe_recipient_key" ON "notification_unsubscribe"("recipient");

-- CreateIndex
CREATE INDEX "notification_unsubscribe_recipient_idx" ON "notification_unsubscribe"("recipient");
