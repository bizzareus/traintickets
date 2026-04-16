import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedditApiService } from './reddit-api.service';
import { RedditGptService } from './reddit-gpt.service';
import { ScreenshotService } from './screenshot.service';
import { BookingV2Service } from '../booking-v2/booking-v2.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RedditAutomationService implements OnModuleInit {
  private readonly logger = new Logger(RedditAutomationService.name);
  private lastSeenTimestamp = 0;

  constructor(
    private readonly redditApi: RedditApiService,
    private readonly gpt: RedditGptService,
    private readonly screenshot: ScreenshotService,
    private readonly bookingV2: BookingV2Service,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.lastSeenTimestamp = Math.floor(Date.now() / 1000);
    this.logger.log(
      'RedditAutomationService initialized, starting from timestamp: ' +
        this.lastSeenTimestamp,
    );
  }

  // Runs every 5 minutes
  // @Cron('*/5 * * * *')
  async handleCron() {
    const threadId = process.env.REDDIT_THREAD_ID || '1lovrfq';
    this.logger.log(`Polling Reddit thread ${threadId}...`);

    try {
      const comments = (await this.redditApi.getLatestComments(threadId)) as Record<
        string,
        any
      >[];

      let maxTimestamp = this.lastSeenTimestamp;
      const now = Math.floor(Date.now() / 1000);

      for (const comment of comments) {
        const data = (comment.data || {}) as Record<string, any>;
        const createdUtc = (data.created_utc as number) || 0;
        if (!createdUtc) continue;

        if (createdUtc > maxTimestamp) {
          maxTimestamp = createdUtc;
        }

        // Process if newer than lastSeen and at least 2 minutes old
        if (createdUtc > this.lastSeenTimestamp && now - createdUtc >= 120) {
          this.logger.log(
            `Found new comment to process: ${comment.data.id as string}`,
          );
          await this.processComment(comment.data as Record<string, any>);
        }
      }

      // We only update lastSeen if we processed old enough comments,
      // but to avoid processing the same comment forever, we should probably
      // just set it to the max timestamp we saw that was also at least 2 minutes old.
      const threshold = now - 120;
      const validTimestamps = comments
        .map((c) => (c.data?.created_utc as number) || 0)
        .filter((t) => t && t <= threshold && t > this.lastSeenTimestamp);

      if (validTimestamps.length > 0) {
        this.lastSeenTimestamp = Math.max(...validTimestamps);
      }
    } catch (e) {
      this.logger.error('Error in handling cron for Reddit', e);
    }
  }

  async analyzeGTM(url: string) {
    this.logger.log(`Manually analyzing Reddit thread: ${url}`);
    // 1. Parse thread ID from URL
    const match = url.match(/\/comments\/([a-z0-9]+)/);
    const threadId = match ? match[1] : '1lovrfq';

    // 2. Fetch comments (using public URL if possible)
    const comments = (await this.redditApi.getCommentsFromUrl(
      url,
    )) as Record<string, any>[];

    const results: any[] = [];
    for (const comment of comments) {
      const commentData = comment.data as Record<string, any>;
      if (!commentData || !commentData.id) continue;

      // Check if already analyzed
      const existing = await this.prisma.redditAnalyzedComment.findUnique({
        where: { id: commentData.id },
      });
      if (existing) continue;

      this.logger.log(`Analyzing new comment ${commentData.id}...`);

      // Analyze with GPT
      const gtmData = await this.gpt.parseGTMDetails(
        commentData.body as string,
        new Date(),
      );

      // Save to DB
      const saved = await this.prisma.redditAnalyzedComment.create({
        data: {
          id: commentData.id,
          content: commentData.body as string,
          author: commentData.author as string,
          permalink: `https://reddit.com${commentData.permalink as string}`,
          trainNumber: gtmData.trainNumber,
          origin: gtmData.origin,
          destination: gtmData.destination,
          pnr: gtmData.pnr,
          dateOfTravel: gtmData.dateOfTravel,
          currentStatus: gtmData.currentStatus,
          rawJson: commentData as any,
        },
      });
      results.push(saved);
    }

    return { analyzedCount: results.length, items: results };
  }

  async getAnalyzedEntries(page: number) {
    const take = 50;
    const skip = (page - 1) * take;
    const items = await this.prisma.redditAnalyzedComment.findMany({
      orderBy: { analyzedAt: 'desc' },
      take,
      skip,
    });
    const total = await this.prisma.redditAnalyzedComment.count();
    return { items, total, page, totalPages: Math.ceil(total / take) };
  }

  private async processComment(comment: Record<string, any>) {
    try {
      // 1. Parse using GPT
      const query = await this.gpt.parseTravelQuery(
        comment.body as string,
        new Date(),
      );
      if (
        !query.isTravelQuery ||
        !query.origin ||
        !query.destination ||
        !query.date
      ) {
        this.logger.log(
          `Comment ${comment.id as string} is not a complete travel query or not related. Skipping.`,
        );
        return;
      }

      this.logger.log(
        `Comment ${comment.id as string} parsed: ${query.origin} to ${query.destination} on ${query.date}`,
      );

      // We need to resolve city names/codes to station rows.
      // Easiest is to search and pick the first station code.
      const fromRes = (await this.bookingV2.searchStations(
        query.origin,
      )) as Record<string, any>;
      const toRes = (await this.bookingV2.searchStations(
        query.destination,
      )) as Record<string, any>;

      const fromStations = (fromRes?.data?.stationList as any[]) || [];
      const toStations = (toRes?.data?.stationList as any[]) || [];

      if (!fromStations.length || !toStations.length) {
        this.logger.warn(
          `Could not resolve stations for comment ${comment.id as string}. Skipping.`,
        );
        return;
      }

      const fromCode = fromStations[0].stationCode as string;
      const toCode = toStations[0].stationCode as string;

      // 2. Train Search
      const trainsRes = (await this.bookingV2.searchTrains(
        fromCode,
        toCode,
        query.date,
      )) as any[];
      const trains = trainsRes || [];

      if (!trains || trains.length === 0) {
        this.logger.log(
          `No trains found for ${fromCode}->${toCode} on ${query.date}. Skipping.`,
        );
        return;
      }

      // Let's just pick the first train for alternate paths
      const targetTrain = trains[0] as Record<string, any>;
      const avlClasses = query.travelClass
        ? [query.travelClass]
        : (targetTrain.avlClasses as string[]) || ['SL', '3A', '2A'];

      // 3. Alternate Path
      const altResult = await this.bookingV2.findAlternatePaths({
        trainNumber: targetTrain.trainNumber as string,
        from: fromCode,
        to: toCode,
        date: query.date,
        avlClasses,
        quota: 'GN',
      });

      if (!altResult || !altResult.legs || altResult.legs.length === 0) {
        this.logger.log(
          `No alternate paths found for train ${targetTrain.trainNumber as string}. Skipping.`,
        );
        return;
      }

      // 4. Generate Screenshot
      const screenshotUrl = await this.screenshot.captureWithInjectedData({
        commentId: comment.id as string,
        altResult,
        trainNumber: targetTrain.trainNumber as string,
        trainName: targetTrain.trainName as string,
        journeyDate: query.date,
        trains,
      });

      // 5. Reply to Reddit
      const markdown = `Here’s the best alternate route for your query from ${fromCode} to ${toCode} on ${targetTrain.trainNumber as string}:

[View Alternate Path Map](${screenshotUrl})

*Trains found:* ${trains.length}
*Total fare:* ₹${altResult.totalFare?.toFixed(0) ?? 'N/A'}`;

      await this.redditApi.replyToComment(comment.id as string, markdown);
    } catch (e) {
      this.logger.error(`Error processing comment ${comment.id}`, e);
      // We explicitly skip and do not retry on error (per requirements)
    }
  }
}
