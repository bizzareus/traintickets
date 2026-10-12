-- CreateEnum
CREATE TYPE "SearchCreditPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "SearchUsageSource" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "SearchUsageOutcome" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SearchUsageDebitStatus" AS ENUM ('PENDING_DEBIT', 'SETTLED', 'SKIPPED', 'OVER_LIMIT_UNCHARGED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "auth0_sub" TEXT,
ADD COLUMN     "phone_verified_at" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "search_ip_quota" (
    "id" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "ip_display" TEXT,
    "free_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_ip_quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_credit_wallet" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_purchased" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_credit_wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_credit_purchase" (
    "id" TEXT NOT NULL,
    "purchase_ref" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "origin_ip_hash" TEXT,
    "amount" INTEGER NOT NULL,
    "credit_quantity" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "SearchCreditPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "muzobox_payment_id" TEXT,
    "pay_url" TEXT,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "contact_email" TEXT,
    "contact_mobile" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_credit_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_usage_log" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "user_id" TEXT,
    "ip_hash" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "from_station" TEXT NOT NULL,
    "to_station" TEXT NOT NULL,
    "journey_date" TEXT,
    "classes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quota" TEXT NOT NULL DEFAULT 'GN',
    "source" "SearchUsageSource" NOT NULL,
    "outcome" "SearchUsageOutcome" NOT NULL DEFAULT 'PENDING',
    "debit_status" "SearchUsageDebitStatus" NOT NULL DEFAULT 'PENDING_DEBIT',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "search_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_ip_quota_ip_hash_key" ON "search_ip_quota"("ip_hash");

-- CreateIndex
CREATE INDEX "search_ip_quota_free_used_idx" ON "search_ip_quota"("free_used");

-- CreateIndex
CREATE UNIQUE INDEX "search_credit_wallet_user_id_key" ON "search_credit_wallet"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "search_credit_purchase_purchase_ref_key" ON "search_credit_purchase"("purchase_ref");

-- CreateIndex
CREATE UNIQUE INDEX "search_credit_purchase_muzobox_payment_id_key" ON "search_credit_purchase"("muzobox_payment_id");

-- CreateIndex
CREATE INDEX "search_credit_purchase_user_id_status_idx" ON "search_credit_purchase"("user_id", "status");

-- CreateIndex
CREATE INDEX "search_credit_purchase_status_created_at_idx" ON "search_credit_purchase"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "search_usage_log_request_id_key" ON "search_usage_log"("request_id");

-- CreateIndex
CREATE INDEX "search_usage_log_ip_hash_created_at_idx" ON "search_usage_log"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "search_usage_log_user_id_created_at_idx" ON "search_usage_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "search_usage_log_outcome_debit_status_created_at_idx" ON "search_usage_log"("outcome", "debit_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0_sub_key" ON "User"("auth0_sub");

-- AddForeignKey
ALTER TABLE "search_credit_wallet" ADD CONSTRAINT "search_credit_wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_credit_purchase" ADD CONSTRAINT "search_credit_purchase_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_usage_log" ADD CONSTRAINT "search_usage_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

