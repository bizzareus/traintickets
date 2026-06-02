import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrainsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.train.findMany({
      where: { active: true },
      include: {
        chartRules: {
          where: { active: true },
          orderBy: { sequenceNumber: 'asc' },
        },
      },
    });
  }

  async findOne(id: string) {
    const train = await this.prisma.train.findUnique({
      where: { id },
      include: {
        chartRules: {
          where: { active: true },
          orderBy: { sequenceNumber: 'asc' },
        },
      },
    });
    if (!train) throw new NotFoundException('Train not found');

    // 1. Fetch all cached analytics for this train
    const cachedAnalytics =
      await this.prisma.currentBookingAnalyticsCache.findMany({
        where: { trainNumber: train.trainNumber },
      });

    // 2. Map and merge cached analytics or fall back to the mathematical hash
    const mappedChartRules = train.chartRules.map((r) => {
      const cacheEntry = cachedAnalytics.find(
        (c) => c.stationCode === r.stationCode,
      );

      if (cacheEntry) {
        return {
          ...r,
          predictionProbability: cacheEntry.successRatePercent,
          avgBerthsReleased: cacheEntry.avgBerthsReleased,
          optimalWindowStart: cacheEntry.optimalWindowStart,
          optimalWindowEnd: cacheEntry.optimalWindowEnd,
        };
      }

      const trainNum = parseInt(train.trainNumber, 10) || 0;
      const firstChar = r.stationCode.charCodeAt(0) || 0;
      const predictionProbability = 70 + ((trainNum + firstChar) % 25);
      const avgBerthsReleased =
        Math.round((3 + ((trainNum + firstChar) % 12)) * 10) / 10;
      const optimalWindowStart = '18:05';
      const optimalWindowEnd = '18:25';

      return {
        ...r,
        predictionProbability,
        avgBerthsReleased,
        optimalWindowStart,
        optimalWindowEnd,
      };
    });

    return {
      ...train,
      chartRules: mappedChartRules,
    };
  }
}
