-- AlterTable
ALTER TABLE "short_link" ADD COLUMN     "click_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_clicked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "short_link_click" (
    "id" TEXT NOT NULL,
    "short_link_id" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "referer" TEXT,
    "metadata" JSONB,

    CONSTRAINT "short_link_click_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "short_link_click_short_link_id_clicked_at_idx" ON "short_link_click"("short_link_id", "clicked_at");

-- AddForeignKey
ALTER TABLE "short_link_click" ADD CONSTRAINT "short_link_click_short_link_id_fkey" FOREIGN KEY ("short_link_id") REFERENCES "short_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "sent_notification_log_recipient_train_number_journey_date_notif" RENAME TO "sent_notification_log_recipient_train_number_journey_date_n_idx";
