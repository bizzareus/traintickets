-- AlterTable
ALTER TABLE "TrainStationChartTime" ADD COLUMN     "chart_next_remote_station" TEXT,
ADD COLUMN     "chart_remote_station" TEXT,
ALTER COLUMN "chart_two_day_offset" DROP NOT NULL,
ALTER COLUMN "chart_two_day_offset" DROP DEFAULT,
ALTER COLUMN "chart_one_day_offset" DROP NOT NULL,
ALTER COLUMN "chart_one_day_offset" DROP DEFAULT;

-- CreateTable
CREATE TABLE "reddit_analyzed_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "train_number" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "pnr" TEXT,
    "date_of_travel" TEXT,
    "current_status" TEXT,
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reddit_analyzed_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reddit_analyzed_comments_train_number_idx" ON "reddit_analyzed_comments"("train_number");

-- CreateIndex
CREATE INDEX "reddit_analyzed_comments_pnr_idx" ON "reddit_analyzed_comments"("pnr");

-- AddForeignKey
ALTER TABLE "ChartTimeAvailabilityTask" ADD CONSTRAINT "ChartTimeAvailabilityTask_journey_request_id_fkey" FOREIGN KEY ("journey_request_id") REFERENCES "JourneyMonitorContact"("journey_request_id") ON DELETE RESTRICT ON UPDATE CASCADE;
