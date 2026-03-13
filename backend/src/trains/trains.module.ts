import { Module } from '@nestjs/common';
import { TrainsController } from './trains.controller';
import { TrainsService } from './trains.service';

@Module({
  controllers: [TrainsController],
  providers: [TrainsService],
})
export class TrainsModule {}
