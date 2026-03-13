-- CreateTable
CREATE TABLE "TrainStationChartTime" (
    "id" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "chart_time_local" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainStationChartTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartTimeAvailabilityTask" (
    "id" TEXT NOT NULL,
    "journey_request_id" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "train_name" TEXT,
    "from_station_code" TEXT NOT NULL,
    "to_station_code" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "journey_date" DATE NOT NULL,
    "class_code" TEXT NOT NULL,
    "chart_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ChartTimeAvailabilityTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainStationChartTime_train_number_station_code_key" ON "TrainStationChartTime"("train_number", "station_code");

-- CreateIndex
CREATE INDEX "TrainStationChartTime_train_number_idx" ON "TrainStationChartTime"("train_number");

-- CreateIndex
CREATE INDEX "TrainStationChartTime_station_code_idx" ON "TrainStationChartTime"("station_code");

-- CreateIndex
CREATE INDEX "ChartTimeAvailabilityTask_chart_at_status_idx" ON "ChartTimeAvailabilityTask"("chart_at", "status");

-- CreateIndex
CREATE INDEX "ChartTimeAvailabilityTask_journey_request_id_idx" ON "ChartTimeAvailabilityTask"("journey_request_id");
