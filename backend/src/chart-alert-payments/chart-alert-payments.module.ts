import { Module } from '@nestjs/common';
import { ChartAlertPaymentsController } from './chart-alert-payments.controller';
import { ChartAlertPaymentsService } from './chart-alert-payments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [PrismaModule, AvailabilityModule],
  controllers: [ChartAlertPaymentsController],
  providers: [ChartAlertPaymentsService],
  exports: [ChartAlertPaymentsService],
})
export class ChartAlertPaymentsModule {}
