/*
  Warnings:

  - You are about to drop the `AlertLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BrowserExecution` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MonitoringRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AlertLog" DROP CONSTRAINT "AlertLog_monitoring_request_id_fkey";

-- DropForeignKey
ALTER TABLE "BrowserExecution" DROP CONSTRAINT "BrowserExecution_chart_event_instance_id_fkey";

-- DropForeignKey
ALTER TABLE "BrowserExecution" DROP CONSTRAINT "BrowserExecution_monitoring_request_id_fkey";

-- DropForeignKey
ALTER TABLE "MonitoringRequest" DROP CONSTRAINT "MonitoringRequest_train_id_fkey";

-- DropForeignKey
ALTER TABLE "MonitoringRequest" DROP CONSTRAINT "MonitoringRequest_user_id_fkey";

-- DropTable
DROP TABLE "AlertLog";

-- DropTable
DROP TABLE "BrowserExecution";

-- DropTable
DROP TABLE "MonitoringRequest";

-- DropEnum
DROP TYPE "AlertChannel";

-- DropEnum
DROP TYPE "AlertLogStatus";

-- DropEnum
DROP TYPE "BrowserExecutionStatus";

-- DropEnum
DROP TYPE "BrowserExecutionType";

-- DropEnum
DROP TYPE "MonitoringRequestStatus";
