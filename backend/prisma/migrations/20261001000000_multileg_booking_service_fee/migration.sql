ALTER TABLE "split_ticket_booking"
  ADD COLUMN "service_fee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pnrs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve legacy confirmations, including their original leg positions.
UPDATE "split_ticket_booking"
SET "pnrs" = CASE
  WHEN "pnr_leg2" IS NOT NULL THEN ARRAY[COALESCE("pnr_leg1", ''), "pnr_leg2"]
  WHEN "pnr_leg1" IS NOT NULL THEN ARRAY["pnr_leg1"]
  ELSE ARRAY[]::TEXT[]
END;
