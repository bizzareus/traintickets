import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function toChartTimestamp(journeyDate: Date, chartTimeLocal: string): Date {
  const [hours, minutes] = chartTimeLocal.split(":").map(Number);
  const local = new Date(journeyDate);
  local.setHours(hours, minutes, 0, 0);
  const offset = 5.5 * 60 * 60 * 1000;
  return new Date(local.getTime() - offset);
}

@Injectable()
export class ChartEventService {
  constructor(private prisma: PrismaService) {}

  async ensureChartEventInstances(
    trainId: string,
    stationCode: string,
    journeyDate: Date,
  ): Promise<void> {
    const rules = await this.prisma.chartRule.findMany({
      where: { trainId, stationCode, active: true },
      orderBy: { sequenceNumber: "asc" },
    });

    for (const rule of rules) {
      const chartTimestamp = toChartTimestamp(journeyDate, rule.chartTimeLocal);
      const existing = await this.prisma.chartEventInstance.findFirst({
        where: {
          trainId,
          stationCode,
          journeyDate,
          sequenceNumber: rule.sequenceNumber,
        },
      });
      if (!existing) {
        await this.prisma.chartEventInstance.create({
          data: {
            trainId,
            stationCode,
            journeyDate,
            chartTimestamp,
            sequenceNumber: rule.sequenceNumber,
          },
        });
      }
    }
  }
}
