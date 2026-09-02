import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IrctcService, TrainScheduleResponse } from '../irctc/irctc.service';

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
              arrivalTime:
                schedule.stationList[schedule.stationList.length - 1]
                  ?.arrivalTime || '00:00',
              chartRules: {
                create: schedule.stationList.map((station, index) => {
                  const chartTimeLocal =
                    station.arrivalTime || station.departureTime || '18:00';
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
      } catch {
        // Ignore or log
      }
    }

    if (!train) throw new NotFoundException('Train not found');

    // 1. Map and generate fallback mathematical hash for chart rules
    const mappedChartRules = train.chartRules.map((r) => {
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
    let schedule: (TrainScheduleResponse & { availableClasses?: string[] }) | null =
      null;
    try {
      const scheduleResult = await this.irctcService.getTrainSchedule(
        train.trainNumber,
      );
      if (scheduleResult.ok) {
        schedule = scheduleResult.schedule;
      }
    } catch {
      // Ignore
    }

    let availableClasses: string[] = [];
    try {
      availableClasses = await this.irctcService.getTrainClasses(
        train.trainNumber,
      );
    } catch {
      // Ignore
    }

    return {
      ...train,
      availableClasses,
      chartRules: mappedChartRules,
      schedule: schedule
        ? { ...schedule, availableClasses }
        : schedule,
    };
  }

  async getClasses(id: string): Promise<string[]> {
    const train = await this.prisma.train.findFirst({
      where: { OR: [{ id }, { trainNumber: id }] },
      select: { trainNumber: true },
    });
    const trainNumber = train?.trainNumber || id;
    return this.irctcService.getTrainClasses(trainNumber);
  }
}
