import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { RedditAutomationService } from './reddit-automation.service';

@Controller('api/admin/reddit-gtm')
export class RedditAutomationController {
  constructor(private readonly redditService: RedditAutomationService) {}

  @Post('analyze')
  async analyzeLatest(@Body() body: { url?: string }) {
    const threadUrl = body.url || 'https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json';
    return await this.redditService.analyzeGTM(threadUrl);
  }

  @Get('entries')
  async getEntries(@Query('page') page = 1) {
    return await this.redditService.getAnalyzedEntries(Number(page));
  }
}
