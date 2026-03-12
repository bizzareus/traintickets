import { Body, Controller, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AlertService } from "../alert/alert.service";
import { MonitoringRequestStatus, BrowserExecutionStatus } from "@prisma/client";

const WEBHOOK_SECRET = process.env.BROWSER_USE_WEBHOOK_SECRET;

function validateSignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
}

@Controller("api/browser/webhook")
export class WebhookController {
  constructor(
    private prisma: PrismaService,
    private alert: AlertService,
  ) {}

  @Post()
  async handle(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    const signature = (req.headers["x-webhook-signature"] as string) ?? (req.headers["x-signature"] as string) ?? null;
    if (WEBHOOK_SECRET && !validateSignature(raw, signature)) {
      throw new UnauthorizedException("Invalid signature");
    }

    const status = body.status as string;
    const jobId = (body.job_id as string) ?? (body as { job_id?: string }).job_id;
    if (!jobId) return { error: "job_id required" };

    const execution = await this.prisma.browserExecution.findFirst({
      where: { jobId },
      include: { monitoringRequest: { include: { train: true } } },
    });

    if (execution) {
      if (execution.status === BrowserExecutionStatus.success || execution.status === BrowserExecutionStatus.failed) {
        return { ok: true, message: "Already processed" };
      }
      await this.prisma.browserExecution.update({
        where: { id: execution.id },
        data: {
          status: status === "seat_available" ? BrowserExecutionStatus.success : BrowserExecutionStatus.failed,
          resultPayload: body as object,
          completedAt: new Date(),
        },
      });
      if (status === "seat_available") {
        await this.prisma.monitoringRequest.update({
          where: { id: execution.monitoringRequestId },
          data: { status: MonitoringRequestStatus.completed },
        });
        const req = execution.monitoringRequest;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        this.alert
          .sendAvailabilityAlert(execution.monitoringRequestId, {
            trainName: req.train.trainName,
            trainNumber: req.train.trainNumber,
            stationCode: req.stationCode,
            journeyDate: req.journeyDate.toISOString().slice(0, 10),
            deepLink: `${appUrl}/dashboard/${req.id}`,
          })
          .catch((err) => console.error("Alert send error:", err));
      } else {
        await this.prisma.monitoringRequest.update({
          where: { id: execution.monitoringRequestId },
          data: { status: MonitoringRequestStatus.expired },
        });
      }
      return { ok: true };
    }

    const availabilityCheck = await this.prisma.availabilityCheck.findUnique({
      where: { jobId },
    });
    if (availabilityCheck && availabilityCheck.status === "running") {
      await this.prisma.availabilityCheck.update({
        where: { id: availabilityCheck.id },
        data: {
          status: status === "seat_available" ? "success" : "failed",
          resultPayload: body as object,
          completedAt: new Date(),
        },
      });
    }

    return { ok: true };
  }
}
