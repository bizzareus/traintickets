import { Controller, Get, Param } from '@nestjs/common';
import { TrainsService } from './trains.service';

@Controller('api/trains')
export class TrainsController {
  constructor(private trains: TrainsService) {}

  @Get()
  findAll() {
    return this.trains.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trains.findOne(id);
  }
}
