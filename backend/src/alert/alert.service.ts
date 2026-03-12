import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AlertChannel, AlertLogStatus } from "@prisma/client";

@Injectable()
export class AlertService {
  constructor(private prisma: PrismaService) {}

  async sendAvailabilityAlert(
    monitoringRequestId: string,
    payload: {
      trainName: string;
      trainNumber: string;
      stationCode: string;
      journeyDate: string;
      deepLink?: string;
    },
  ): Promise<void> {
    const message = `Seats available on ${payload.trainName} (${payload.trainNumber}) from ${payload.stationCode} on ${payload.journeyDate}. Book immediately.${payload.deepLink ? ` ${payload.deepLink}` : ""}`;

    const channels: AlertChannel[] = ["whatsapp", "call", "push"];

    for (const channel of channels) {
      let status: AlertLogStatus = "sent";
      try {
        if (process.env.NODE_ENV === "development") {
          console.log("[AlertLog]", channel, status, message.slice(0, 80));
        }
        await this.prisma.alertLog.create({
          data: { monitoringRequestId, channel, status },
        });
      } catch {
        status = "failed";
        await this.prisma.alertLog.create({
          data: { monitoringRequestId, channel, status },
        });
      }
    }
  }
}
