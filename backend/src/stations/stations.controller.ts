import { Controller, Get } from "@nestjs/common";
import { StationsService } from "./stations.service";

@Controller("api/stations")
export class StationsController {
  constructor(private stations: StationsService) {}

  @Get()
  findAll() {
    return this.stations.findAll();
  }
}
