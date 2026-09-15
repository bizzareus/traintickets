-- CreateEnum
CREATE TYPE "ChartAlertRefundStatus" AS ENUM ('NONE', 'INITIATED', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "chart_alert_payment" ADD COLUMN "refund_status" "ChartAlertRefundStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "razorpay_refund_id" TEXT,
ADD COLUMN "refund_amount" INTEGER,
ADD COLUMN "refund_reason" TEXT,
ADD COLUMN "refund_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refund_initiated_at" TIMESTAMP(3),
ADD COLUMN "refunded_at" TIMESTAMP(3),
ADD COLUMN "refund_error" TEXT,
ADD COLUMN "refund_response" JSONB;

-- CreateIndex
CREATE INDEX "chart_alert_payment_journey_request_id_idx" ON "chart_alert_payment"("journey_request_id");
CREATE INDEX "chart_alert_payment_refund_status_idx" ON "chart_alert_payment"("refund_status");
