-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','PAID','FAILED','REFUNDED');

-- CreateTable
CREATE TABLE "payment_transaction" (
    "id" TEXT NOT NULL,
    "qr_code_id" TEXT,
    "order_id" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpay_payment_id" TEXT,
    "contact_email" TEXT,
    "contact_mobile" TEXT,
    "journey_payload" JSONB,
    "journey_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transaction_qr_code_id_key" ON "payment_transaction"("qr_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transaction_order_id_key" ON "payment_transaction"("order_id");

-- CreateIndex
CREATE INDEX "payment_transaction_status_idx" ON "payment_transaction"("status");
