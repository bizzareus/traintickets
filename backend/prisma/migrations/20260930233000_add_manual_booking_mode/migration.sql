CREATE TYPE "SplitBookingMode" AS ENUM ('AI', 'MANUAL');

ALTER TYPE "SplitBookingFulfillmentStatus" ADD VALUE 'MANUAL_PENDING';

ALTER TABLE "split_ticket_booking"
  ADD COLUMN "booking_mode" "SplitBookingMode" NOT NULL DEFAULT 'AI',
  ADD COLUMN "manual_email_sent_at" TIMESTAMP(3),
  ADD COLUMN "manual_whatsapp_sent_at" TIMESTAMP(3);
