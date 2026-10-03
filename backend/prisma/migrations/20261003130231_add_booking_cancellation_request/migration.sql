-- CreateEnum
CREATE TYPE "CancellationRequestStatus" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED');

-- AlterTable
ALTER TABLE "split_ticket_booking" ADD COLUMN     "customer_payment_email_sent_at" TIMESTAMP(3),
ADD COLUMN     "customer_payment_whatsapp_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "booking_cancellation_request" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "booking_ref" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "reason" TEXT,
    "status" "CancellationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "admin_notes" TEXT,
    "admin_email_sent_at" TIMESTAMP(3),
    "admin_whatsapp_sent_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_cancellation_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_cancellation_request_booking_id_idx" ON "booking_cancellation_request"("booking_id");

-- CreateIndex
CREATE INDEX "booking_cancellation_request_booking_ref_idx" ON "booking_cancellation_request"("booking_ref");

-- CreateIndex
CREATE INDEX "booking_cancellation_request_status_created_at_idx" ON "booking_cancellation_request"("status", "created_at");

-- AddForeignKey
ALTER TABLE "booking_cancellation_request" ADD CONSTRAINT "booking_cancellation_request_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "split_ticket_booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
