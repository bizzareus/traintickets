-- AlterTable
ALTER TABLE "TrainList" ADD COLUMN "chart_time_ingestion_done" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "TrainList_chart_time_ingestion_done_idx" ON "TrainList"("chart_time_ingestion_done");
