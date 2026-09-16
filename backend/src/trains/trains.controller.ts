import { Controller, Get, Param, Query } from '@nestjs/common';
import { TrainsService } from './trains.service';

@Controller('api/trains')
export class TrainsController {
  constructor(private trains: TrainsService) {}

  @Get()
  findAll(@Query('q') q?: string) {
    if (q && q.trim().length >= 2) {
      return this.trains.search(q);
    }
    return this.trains.findAll();
  }

  @Get(':id/classes')
  getClasses(@Param('id') id: string) {
    return this.trains.getClasses(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trains.findOne(id);
  }
}
