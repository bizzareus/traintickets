-- AlterTable
ALTER TABLE "TrainScheduleCache" ADD COLUMN     "available_classes" TEXT[] DEFAULT ARRAY[]::TEXT[];
