import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BrowserUseService } from "../browser-use/browser-use.service";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3009";

@Injectable()
export class AvailabilityService {
  constructor(
    private prisma: PrismaService,
    private browserUse: BrowserUseService,
  ) {}

  async startCheck(params: {
    trainNumber: string;
    stationCode: string;
    classCode: string;
    journeyDate: string;
  }) {
    const check = await this.prisma.availabilityCheck.create({
      data: {
        trainNumber: params.trainNumber,
        stationCode: params.stationCode,
        classCode: params.classCode,
        journeyDate: new Date(params.journeyDate),
        status: "pending",
      },
    });

    try {
      const { jobId } = await this.browserUse.executeAvailabilityCheck({
        trainNumber: params.trainNumber,
        stationCode: params.stationCode,
        classCode: params.classCode,
        journeyDate: params.journeyDate,
        callbackUrl: `${API_URL}/api/browser/webhook`,
      });

      await this.prisma.availabilityCheck.update({
        where: { id: check.id },
        data: { jobId, status: "running" },
      });

      return { id: check.id, jobId, status: "running" as const };
    } catch (err) {
      await this.prisma.availabilityCheck.update({
        where: { id: check.id },
        data: { status: "failed", completedAt: new Date() },
      });
      throw err;
    }
  }

  async getByJobId(jobId: string) {
    const check = await this.prisma.availabilityCheck.findUnique({
      where: { jobId },
    });
    return check;
  }
}
