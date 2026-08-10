import { Controller, Get, Param } from '@nestjs/common';
import { ShortLinkService } from './short-link.service';

@Controller('short-link')
export class ShortLinkController {
  constructor(private readonly shortLinkService: ShortLinkService) {}

  @Get(':code')
  async getShortLink(@Param('code') code: string) {
    return this.shortLinkService.getShortLink(code);
  }
}
