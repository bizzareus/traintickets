import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { RedditAutomationService } from './reddit-automation.service';

@Controller('api/admin/reddit-gtm')
export class RedditAutomationController {
  constructor(private readonly redditService: RedditAutomationService) {}

  @Post('sync')
  async syncLatest(@Body() body: { url?: string }) {
    const threadUrl = body.url || 'https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json';
    return await this.redditService.syncRedditComments(threadUrl);
  }

  @Post('analyze')
  async analyzeLatest(@Body() body: { url?: string }) {
    const threadUrl = body.url || 'https://www.reddit.com/r/indianrailways/comments/1lovrfq/travel_queries_thread_for_all_questions_related/.json';
    return await this.redditService.syncRedditComments(threadUrl);
  }

  @Post('process/:id')
  async processComment(@Param('id') id: string) {
    return await this.redditService.processCommentAI(id);
  }

  @Get('entries')
  async getEntries(@Query('page') page = 1) {
    return await this.redditService.getAnalyzedEntries(Number(page));
  }
}
