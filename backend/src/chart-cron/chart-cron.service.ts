import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { BrowserUseService } from "../browser-use/browser-use.service";

const API_URL = process.env.API_URL ?? "http://localhost:3009";

@Injectable()
export class ChartCronService {
  constructor(
    private prisma: PrismaService,
    private browserUse: BrowserUseService,
  ) {}

  @Cron("* * * * *") // every minute
  async handleChartCron() {
    const now = new Date();
    const due = await this.prisma.chartEventInstance.findMany({
      where: {
        chartTimestamp: { lte: now },
        executed: false,
      },
      orderBy: { chartTimestamp: "asc" },
      take: 50,
      include: { train: true },
    });

    for (const instance of due) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.chartEventInstance.updateMany({
          where: { id: instance.id, executed: false },
          data: { executed: true, executedAt: now },
        });
        return result.count;
      });

      if (updated === 0) continue;

      const requests = await this.prisma.monitoringRequest.findMany({
        where: {
          trainId: instance.trainId,
          stationCode: instance.stationCode,
          journeyDate: instance.journeyDate,
          status: "scheduled",
        },
        include: { train: true },
      });

      for (const req of requests) {
        const execution = await this.prisma.browserExecution.create({
          data: {
            monitoringRequestId: req.id,
            chartEventInstanceId: instance.id,
            type: "availability",
            status: "pending",
          },
        });

        const trigger = async () => {
          const { jobId } = await this.browserUse.executeAvailabilityCheck({
            trainNumber: req.train.trainNumber,
            stationCode: req.stationCode,
            classCode: req.classCode,
            journeyDate: req.journeyDate.toISOString().slice(0, 10),
            callbackUrl: `${API_URL}/api/browser/webhook`,
          });
          await this.prisma.browserExecution.update({
            where: { id: execution.id },
            data: { jobId, status: "running" },
          });
        };

        try {
          await trigger();
        } catch (err) {
          console.error("Browser Use error for execution", execution.id, err);
          try {
            await trigger();
          } catch (retryErr) {
            console.error("Retry failed for execution", execution.id, retryErr);
            await this.prisma.browserExecution.update({
              where: { id: execution.id },
              data: { status: "failed" },
            });
          }
        }
      }

      if (requests.length > 0) {
        console.log("chart_events_triggered_count=1 browser_jobs_spawned=" + requests.length);
      }
    }

    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const timedOut = await this.prisma.browserExecution.updateMany({
      where: {
        status: { in: ["pending", "running"] },
        createdAt: { lt: fiveMinAgo },
      },
      data: { status: "failed" },
    });
    if (timedOut.count > 0) {
      console.log("webhook_timeout marked_failed=" + timedOut.count);
    }
  }
}
