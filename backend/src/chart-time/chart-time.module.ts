import { Module } from '@nestjs/common';
import { ChartTimeService } from './chart-time.service';
import { ChartTimeController } from './chart-time.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BrowserUseModule } from '../browser-use/browser-use.module';

@Module({
  imports: [PrismaModule, BrowserUseModule],
  controllers: [ChartTimeController],
  providers: [ChartTimeService],
  exports: [ChartTimeService],
})
export class ChartTimeModule {}
