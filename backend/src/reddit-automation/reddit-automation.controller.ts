import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_PASSWORD_HEADER, assertAdminAuth } from '../common/admin-auth';
import { RedditAutomationService } from './reddit-automation.service';

@Controller('api/admin/reddit-gtm')
export class RedditAutomationController {
  constructor(private readonly redditService: RedditAutomationService) {}

  @Post('sync')
  async syncLatest(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body() body: { url?: string },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    const threadUrl =
      body.url ||
      'https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json';
    return await this.redditService.syncRedditComments(threadUrl);
  }

  @Post('analyze')
  async analyzeLatest(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Body() body: { url?: string },
  ) {
    assertAdminAuth({ headerPw: pw, req });
    const threadUrl =
      body.url ||
      'https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json';
    return await this.redditService.syncRedditComments(threadUrl);
  }

  @Post('process/:id')
  async processComment(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return await this.redditService.processCommentAI(id);
  }

  @Get('entries')
  async getEntries(
    @Headers(ADMIN_PASSWORD_HEADER) pw: string | undefined,
    @Req() req: Request,
    @Query('page') page = 1,
  ) {
    assertAdminAuth({ headerPw: pw, req });
    return await this.redditService.getAnalyzedEntries(Number(page));
  }
}
