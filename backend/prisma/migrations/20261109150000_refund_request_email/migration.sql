-- Refund requests now identify the customer by email instead of mobile.
-- Mobile was a plain TEXT column, so a rename preserves rows; phone digits
-- are cleared since they are not email addresses.
ALTER TABLE "refund_request" RENAME COLUMN "mobile" TO "email";
UPDATE "refund_request" SET "email" = '';

-- DropIndex + CreateIndex
DROP INDEX "refund_request_mobile_idx";
CREATE INDEX "refund_request_email_idx" ON "refund_request"("email");
