import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChartEventService } from "../chart-event/chart-event.service";

@Injectable()
export class MonitoringRequestsService {
  constructor(
    private prisma: PrismaService,
    private chartEvent: ChartEventService,
  ) {}

  async list(userId: string) {
    const list = await this.prisma.monitoringRequest.findMany({
      where: { userId },
      include: { train: true },
      orderBy: { createdAt: "desc" },
    });
    const withChartTime = await Promise.all(
      list.map(async (req) => {
        const chartInstance = await this.prisma.chartEventInstance.findFirst({
          where: {
            trainId: req.trainId,
            stationCode: req.stationCode,
            journeyDate: req.journeyDate,
          },
        });
        return {
          ...req,
          chartTimestamp: chartInstance?.chartTimestamp ?? null,
        };
      }),
    );
    return withChartTime;
  }

  async getOne(userId: string, id: string) {
    const request = await this.prisma.monitoringRequest.findFirst({
      where: { id, userId },
      include: {
        train: true,
        browserExecutions: { orderBy: { createdAt: "desc" } },
        alertLogs: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!request) throw new NotFoundException("Not found");
    const chartInstance = await this.prisma.chartEventInstance.findFirst({
      where: {
        trainId: request.trainId,
        stationCode: request.stationCode,
        journeyDate: request.journeyDate,
      },
    });
    return {
      ...request,
      chartTimestamp: chartInstance?.chartTimestamp ?? null,
      executions: request.browserExecutions,
      alertLogs: request.alertLogs,
    };
  }

  async create(
    userId: string,
    body: { trainId: string; stationCode: string; journeyDate: string; classCode: string },
  ) {
    const journeyDateObj = new Date(body.journeyDate + "T00:00:00.000Z");
    await this.chartEvent.ensureChartEventInstances(
      body.trainId,
      body.stationCode,
      journeyDateObj,
    );
    return this.prisma.monitoringRequest.create({
      data: {
        userId,
        trainId: body.trainId,
        stationCode: body.stationCode,
        journeyDate: journeyDateObj,
        classCode: body.classCode,
        status: "scheduled",
      },
      include: { train: true },
    });
  }
}
