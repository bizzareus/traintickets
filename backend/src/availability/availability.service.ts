import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserUseService } from '../browser-use/browser-use.service';

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'http://localhost:3009';

@Injectable()
export class AvailabilityService {
  constructor(
    private prisma: PrismaService,
    private browserUse: BrowserUseService,
  ) {}

  async startCheck(params: {
    trainNumber: string;
    trainName?: string;
    stationCode: string;
    fromStationName?: string;
    toStationCode?: string;
    toStationName?: string;
    classCode: string;
    journeyDate: string;
    passengerDetails?: string;
  }): Promise<{
    status: string;
    jobId: string;
    checkId: string;
  }> {
    const check = await this.prisma.availabilityCheck.create({
      data: {
        trainNumber: params.trainNumber,
        stationCode: params.stationCode,
        classCode: params.classCode,
        journeyDate: new Date(params.journeyDate),
        status: 'pending',
      },
    });

    try {
      const { jobId } = await this.browserUse.startAvailabilityCheck({
        trainNumber: params.trainNumber,
        trainName: params.trainName,
        fromStationCode: params.stationCode,
        fromStationName: params.fromStationName,
        toStationCode: params.toStationCode,
        toStationName: params.toStationName,
        classCode: params.classCode,
        journeyDate: params.journeyDate,
        passengerDetails: params.passengerDetails,
        callbackUrl: `${API_URL}/api/browser/webhook`,
      });

      await this.prisma.availabilityCheck.update({
        where: { id: check.id },
        data: { status: 'running', jobId: jobId || null },
      });

      return {
        status: 'running',
        jobId,
        checkId: check.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.availabilityCheck.update({
        where: { id: check.id },
        data: {
          status: 'failed',
          resultPayload: { error: message } as object,
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  /**
   * Fetch job status and output from Browser Use. When terminal, optionally sync to our DB.
   */
  async getJobStatus(jobId: string): Promise<{
    status: string;
    output: string | null;
    steps?: unknown[];
    resultPayload?: unknown;
  }> {
    const result = await this.browserUse.getJobStatus(jobId);
    const payload: Record<string, unknown> =
      result.resultPayload != null
        ? (result.resultPayload as Record<string, unknown>)
        : {
            output: result.output,
            ...(result.steps && { steps: result.steps }),
          };

    if (result.status === 'success' || result.status === 'failed') {
      const check = await this.prisma.availabilityCheck.findFirst({
        where: { jobId },
      });
      if (check) {
        await this.prisma.availabilityCheck.update({
          where: { id: check.id },
          data: {
            status: result.status === 'success' ? 'success' : 'failed',
            resultPayload: payload as object,
            completedAt: new Date(),
          },
        });
      }
    }

    return {
      status: result.status,
      output: result.output,
      steps: result.steps,
      resultPayload: Object.keys(payload).length > 0 ? payload : undefined,
    };
  }

  async getByJobId(jobId: string) {
    const check = await this.prisma.availabilityCheck.findUnique({
      where: { jobId },
    });
    return check;
  }
}
