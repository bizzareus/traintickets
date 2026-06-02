-- AlterTable
ALTER TABLE "CronLease" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "reddit_analyzed_comments" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "analyzed_at" DROP NOT NULL,
ALTER COLUMN "analyzed_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "current_booking_analytics_cache" (
    "id" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "class_code" TEXT NOT NULL,
    "success_rate_percent" INTEGER NOT NULL,
    "avg_berths_released" DOUBLE PRECISION NOT NULL,
    "optimal_window_start" TEXT NOT NULL,
    "optimal_window_end" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "current_booking_analytics_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "current_booking_analytics_cache_train_number_station_code_idx" ON "current_booking_analytics_cache"("train_number", "station_code");

-- CreateIndex
CREATE UNIQUE INDEX "current_booking_analytics_cache_train_number_station_code_c_key" ON "current_booking_analytics_cache"("train_number", "station_code", "class_code");
