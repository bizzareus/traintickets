ALTER TABLE "chart_alert_payment"
  ADD COLUMN "delivery_failure_detected_at" TIMESTAMP(3),
  ADD COLUMN "delivery_failure_refund_notified_at" TIMESTAMP(3),
  ADD COLUMN "delivery_failure_notification_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_failure_notification_error" TEXT;

CREATE INDEX "chart_alert_payment_delivery_failure_refund_notified_at_idx"
  ON "chart_alert_payment"("delivery_failure_refund_notified_at");
