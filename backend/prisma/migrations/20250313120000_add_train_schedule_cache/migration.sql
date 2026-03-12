-- CreateTable
CREATE TABLE "TrainScheduleCache" (
    "id" TEXT NOT NULL,
    "train_number" TEXT NOT NULL,
    "train_name" TEXT NOT NULL,
    "station_from" TEXT NOT NULL,
    "station_to" TEXT NOT NULL,
    "station_list" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainScheduleCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainScheduleCache_train_number_key" ON "TrainScheduleCache"("train_number");

-- CreateIndex
CREATE INDEX "TrainScheduleCache_train_number_idx" ON "TrainScheduleCache"("train_number");
