-- AlterTable
ALTER TABLE "TrainStationChartTime" ADD COLUMN     "chart_two_day_offset" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chart_two_time_local" TEXT;
