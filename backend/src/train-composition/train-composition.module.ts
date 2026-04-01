import { Module } from '@nestjs/common';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { IrctcModule } from '../irctc/irctc.module';
import { TrainCompositionController } from './train-composition.controller';
import { TrainCompositionService } from './train-composition.service';

@Module({
  imports: [IrctcModule, ChartTimeModule],
  controllers: [TrainCompositionController],
  providers: [TrainCompositionService],
  exports: [TrainCompositionService],
})
export class TrainCompositionModule {}
