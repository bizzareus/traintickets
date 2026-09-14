-- CreateEnum
CREATE TYPE "ChartAlertPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "chart_alert_payment" (
    "id" TEXT NOT NULL,
    "muzobox_payment_id" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "ChartAlertPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpay_payment_id" TEXT,
    "razorpay_order_id" TEXT,
    "contact_email" TEXT,
    "contact_mobile" TEXT,
    "journey_payload" JSONB NOT NULL,
    "journey_request_id" TEXT,
    "pay_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "chart_alert_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chart_alert_payment_muzobox_payment_id_key" ON "chart_alert_payment"("muzobox_payment_id");

-- CreateIndex
CREATE INDEX "chart_alert_payment_status_idx" ON "chart_alert_payment"("status");
