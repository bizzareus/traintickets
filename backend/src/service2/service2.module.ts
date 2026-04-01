import { Module } from '@nestjs/common';
import { Service2Controller } from './service2.controller';
import { Service2Service } from './service2.service';
import { IrctcModule } from '../irctc/irctc.module';
import { ChartTimeModule } from '../chart-time/chart-time.module';
import { TrainCompositionModule } from '../train-composition/train-composition.module';

@Module({
  imports: [IrctcModule, ChartTimeModule, TrainCompositionModule],
  controllers: [Service2Controller],
  providers: [Service2Service],
  exports: [Service2Service],
})
export class Service2Module {}
