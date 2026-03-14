-- AlterTable
ALTER TABLE "ChartTimeAvailabilityTask" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "JourneyMonitoringRequest" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ChartTimeAvailabilityTask_user_id_idx" ON "ChartTimeAvailabilityTask"("user_id");

-- CreateIndex
CREATE INDEX "JourneyMonitoringRequest_user_id_idx" ON "JourneyMonitoringRequest"("user_id");

-- AddForeignKey
ALTER TABLE "JourneyMonitoringRequest" ADD CONSTRAINT "JourneyMonitoringRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartTimeAvailabilityTask" ADD CONSTRAINT "ChartTimeAvailabilityTask_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
