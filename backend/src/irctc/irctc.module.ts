import { Module } from '@nestjs/common';
import { IrctcController } from './irctc.controller';
import { IrctcService } from './irctc.service';
import { IrctcChartService } from './irctc-chart.service';
import { IrctcBrowserUseService } from './irctc-browser-use.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [IrctcController],
  providers: [IrctcService, IrctcChartService, IrctcBrowserUseService],
  exports: [IrctcService, IrctcChartService, IrctcBrowserUseService],
})
export class IrctcModule {}
