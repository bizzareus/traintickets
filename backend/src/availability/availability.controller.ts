import { Body, Controller, Get, Param, Post, ServiceUnavailableException } from "@nestjs/common";
import { AvailabilityService } from "./availability.service";

@Controller("api/availability")
export class AvailabilityController {
  constructor(private availability: AvailabilityService) {}

  @Post("check")
  async startCheck(
    @Body("trainNumber") trainNumber: string,
    @Body("stationCode") stationCode: string,
    @Body("classCode") classCode: string,
    @Body("journeyDate") journeyDate: string,
  ) {
    const normalized = {
      trainNumber: String(trainNumber ?? "").trim(),
      stationCode: String(stationCode ?? "").trim().toUpperCase(),
      classCode: String(classCode ?? "3A").trim().toUpperCase(),
      journeyDate: String(journeyDate ?? "").trim(),
    };
    if (!normalized.trainNumber || !normalized.stationCode || !normalized.journeyDate) {
      return { error: "trainNumber, stationCode and journeyDate are required" };
    }
    try {
      return await this.availability.startCheck(normalized);
    } catch {
      throw new ServiceUnavailableException(
        "Availability check service is temporarily unavailable. Please try again later."
      );
    }
  }

  @Get("check/:jobId")
  async getCheck(@Param("jobId") jobId: string) {
    const check = await this.availability.getByJobId(jobId);
    if (!check) return { error: "Not found", status: null };
    return {
      id: check.id,
      jobId: check.jobId,
      status: check.status,
      trainNumber: check.trainNumber,
      stationCode: check.stationCode,
      classCode: check.classCode,
      journeyDate: check.journeyDate?.toISOString?.()?.slice(0, 10),
      resultPayload: check.resultPayload,
      completedAt: check.completedAt?.toISOString?.() ?? null,
    };
  }
}
