-- CreateTable
CREATE TABLE "CronLease" (
    "name" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronLease_pkey" PRIMARY KEY ("name")
);
