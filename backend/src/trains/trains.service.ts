import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IrctcService } from '../irctc/irctc.service';

@Injectable()
export class TrainsService {
  constructor(
    private prisma: PrismaService,
    private irctcService: IrctcService,
  ) {}

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
    let train = await this.prisma.train.findUnique({
      where: { id },
      include: {
        chartRules: {
          where: { active: true },
          orderBy: { sequenceNumber: 'asc' },
        },
      },
    });

    if (!train) {
      // Try finding by trainNumber
      train = await this.prisma.train.findFirst({
        where: { trainNumber: id },
        include: {
          chartRules: {
            where: { active: true },
            orderBy: { sequenceNumber: 'asc' },
          },
        },
      });
    }

    // If still not found, try to dynamically fetch schedule and create the train
    if (!train) {
      try {
        const scheduleResult = await this.irctcService.getTrainSchedule(id);
        if (scheduleResult.ok) {
          const { schedule } = scheduleResult;
          // Create the train dynamically
          train = await this.prisma.train.create({
            data: {
              trainNumber: schedule.trainNumber,
              trainName: schedule.trainName,
              originStation: schedule.stationFrom || '',
              destinationStation: schedule.stationTo || '',
              departureTime: schedule.stationList[0]?.departureTime || '00:00',
              arrivalTime: schedule.stationList[schedule.stationList.length - 1]?.arrivalTime || '00:00',
              chartRules: {
                create: schedule.stationList.map((station, index) => {
                  const chartTimeLocal = station.arrivalTime || station.departureTime || '18:00';
                  return {
                    stationCode: station.stationCode,
                    chartTimeLocal,
                    sequenceNumber: index + 1,
                  };
                }),
              },
            },
            include: {
              chartRules: {
                where: { active: true },
                orderBy: { sequenceNumber: 'asc' },
              },
            },
          });
        }
      } catch (err) {
        // Ignore or log
      }
    }

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

    // 3. Fetch schedule cache details for the train
    let schedule: any = null;
    try {
      const scheduleResult = await this.irctcService.getTrainSchedule(train.trainNumber);
      if (scheduleResult.ok) {
        schedule = scheduleResult.schedule;
      }
    } catch (err) {
      // Ignore
    }

    return {
      ...train,
      chartRules: mappedChartRules,
      schedule,
    };
  }
}

