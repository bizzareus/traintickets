import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  getTrains() {
    return this.prisma.train.findMany({
      include: { chartRules: { orderBy: { sequenceNumber: 'asc' } } },
      orderBy: { trainNumber: 'asc' },
    });
  }

  createTrain(body: {
    trainNumber: string;
    trainName: string;
    originStation: string;
    destinationStation: string;
    departureTime?: string;
    arrivalTime?: string;
    active?: boolean;
  }) {
    return this.prisma.train.create({
      data: {
        trainNumber: body.trainNumber,
        trainName: body.trainName,
        originStation: body.originStation,
        destinationStation: body.destinationStation,
        departureTime: body.departureTime ?? null,
        arrivalTime: body.arrivalTime ?? null,
        active: body.active ?? true,
      },
    });
  }

  getChartRules() {
    return this.prisma.chartRule.findMany({
      include: { train: true },
      orderBy: [{ trainId: 'asc' }, { sequenceNumber: 'asc' }],
    });
  }

  createChartRule(body: {
    trainId: string;
    stationCode: string;
    chartTimeLocal: string;
    sequenceNumber: number;
    active?: boolean;
  }) {
    return this.prisma.chartRule.create({
      data: {
        trainId: body.trainId,
        stationCode: body.stationCode,
        chartTimeLocal: body.chartTimeLocal,
        sequenceNumber: body.sequenceNumber,
        active: body.active ?? true,
      },
      include: { train: true },
    });
  }

  getChartEventInstances(limit: number) {
    return this.prisma.chartEventInstance.findMany({
      include: { train: true },
      orderBy: { chartTimestamp: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
