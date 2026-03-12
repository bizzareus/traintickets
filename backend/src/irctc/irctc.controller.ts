import { Controller, Get, Param, ServiceUnavailableException } from "@nestjs/common";
import { IrctcService } from "./irctc.service";

@Controller("api/irctc")
export class IrctcController {
  constructor(private irctc: IrctcService) {}

  @Get("trains")
  async getTrains() {
    try {
      return await this.irctc.getTrainList();
    } catch {
      throw new ServiceUnavailableException("Train list is temporarily unavailable.");
    }
  }

  @Get("schedule/:trainNumber")
  async getSchedule(@Param("trainNumber") trainNumber: string) {
    const schedule = await this.irctc.getTrainSchedule(trainNumber);
    if (!schedule) {
      throw new ServiceUnavailableException("Schedule for this train is not available.");
    }
    return schedule;
  }
}
