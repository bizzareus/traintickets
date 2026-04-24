ALTER TABLE "ChartTimeAvailabilityTask"
ADD COLUMN IF NOT EXISTS "train_start_date" DATE;

ALTER TABLE "ChartTimeAvailabilityTask"
DROP COLUMN IF EXISTS "class_code";
