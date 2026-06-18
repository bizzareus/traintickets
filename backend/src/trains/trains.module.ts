import { Module } from '@nestjs/common';
import { TrainsController } from './trains.controller';
import { TrainsService } from './trains.service';
import { IrctcModule } from '../irctc/irctc.module';

@Module({
  imports: [IrctcModule],
  controllers: [TrainsController],
  providers: [TrainsService],
})
export class TrainsModule {}

