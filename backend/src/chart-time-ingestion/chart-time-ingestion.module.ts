import { Module } from '@nestjs/common';
import { IrctcModule } from '../irctc/irctc.module';
import { ChartTimeIngestionController } from './chart-time-ingestion.controller';
import { ChartTimeIngestionService } from './chart-time-ingestion.service';

@Module({
  imports: [IrctcModule],
  controllers: [ChartTimeIngestionController],
  providers: [ChartTimeIngestionService],
})
export class ChartTimeIngestionModule {}
