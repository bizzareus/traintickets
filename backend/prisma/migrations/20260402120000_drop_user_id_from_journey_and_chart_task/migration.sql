-- Reconcile migration history with schema.prisma: user_id was removed from these models.
-- IF EXISTS: safe if columns were already dropped manually (no error, no other data touched).
ALTER TABLE "ChartTimeAvailabilityTask" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "JourneyMonitoringRequest" DROP COLUMN IF EXISTS "user_id";
