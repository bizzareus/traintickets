import { Module, Logger } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { RedditAutomationService } from './reddit-automation.service';
import { ScreenshotService } from './screenshot.service';
import { RedditGptService } from './reddit-gpt.service';
import { RedditApiService } from './reddit-api.service';
import { BookingV2Module } from '../booking-v2/booking-v2.module';

@Module({
  imports: [ScheduleModule.forRoot(), HttpModule, BookingV2Module],
  providers: [
    RedditAutomationService,
    ScreenshotService,
    RedditGptService,
    RedditApiService,
    Logger,
  ],
  exports: [RedditAutomationService],
})
export class RedditAutomationModule {}
