-- Keep historical amounts unchanged; new bookings save their fee snapshot in paise.
ALTER TABLE "split_ticket_booking"
ADD COLUMN "irctc_service_fee_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "payment_gateway_fee_paise" INTEGER NOT NULL DEFAULT 0;
