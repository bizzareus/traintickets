-- CreateEnum
CREATE TYPE "SplitBookingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "SplitBookingFulfillmentStatus" AS ENUM ('IDLE', 'QUEUED', 'IN_PROGRESS', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "chart_alert_payment" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refund_request" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "split_ticket_booking" (
    "id" TEXT NOT NULL,
    "booking_ref" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "train_name" TEXT,
    "from_station_code" TEXT NOT NULL,
    "to_station_code" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "travel_class" TEXT NOT NULL,
    "quota" TEXT NOT NULL DEFAULT 'GN',
    "total_fare" INTEGER NOT NULL,
    "legs_payload" JSONB NOT NULL,
    "passengers" JSONB NOT NULL,
    "contact_mobile" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "auto_upgrade" BOOLEAN NOT NULL DEFAULT true,
    "payment_status" "SplitBookingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "booking_status" "SplitBookingFulfillmentStatus" NOT NULL DEFAULT 'IDLE',
    "automation_logs" JSONB,
    "pnr_leg1" TEXT,
    "pnr_leg2" TEXT,
    "booking_error" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_ticket_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "split_ticket_booking_booking_ref_key" ON "split_ticket_booking"("booking_ref");

-- CreateIndex
CREATE INDEX "split_ticket_booking_booking_ref_idx" ON "split_ticket_booking"("booking_ref");

-- CreateIndex
CREATE INDEX "split_ticket_booking_payment_status_booking_status_idx" ON "split_ticket_booking"("payment_status", "booking_status");
