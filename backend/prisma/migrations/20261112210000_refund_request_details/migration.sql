-- AlterTable
ALTER TABLE "refund_request" ADD COLUMN IF NOT EXISTS "refund_id" TEXT,
ADD COLUMN IF NOT EXISTS "razorpay_payment_id" TEXT,
ADD COLUMN IF NOT EXISTS "refund_amount" INTEGER,
ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "refund_error" TEXT;
