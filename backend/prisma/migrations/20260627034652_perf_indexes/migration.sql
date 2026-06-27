-- DropIndex
DROP INDEX "station_cache_station_name_idx";

-- CreateIndex
CREATE INDEX "ChartRule_train_id_sequence_number_idx" ON "ChartRule"("train_id", "sequence_number");
