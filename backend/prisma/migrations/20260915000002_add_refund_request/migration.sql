-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "refund_request" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "txn_id" TEXT,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_request_status_created_at_idx" ON "refund_request"("status", "created_at");
CREATE INDEX "refund_request_mobile_idx" ON "refund_request"("mobile");
