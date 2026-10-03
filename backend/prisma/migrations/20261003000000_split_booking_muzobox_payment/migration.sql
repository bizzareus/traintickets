ALTER TABLE "split_ticket_booking"
ADD COLUMN "muzobox_payment_id" TEXT,
ADD COLUMN "pay_url" TEXT;

CREATE UNIQUE INDEX "split_ticket_booking_muzobox_payment_id_key"
ON "split_ticket_booking"("muzobox_payment_id");
