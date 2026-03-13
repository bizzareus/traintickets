import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('api/search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('journeyDate') journeyDate: string,
  ) {
    return this.searchService.search(from ?? '', to ?? '', journeyDate ?? '');
  }
}
