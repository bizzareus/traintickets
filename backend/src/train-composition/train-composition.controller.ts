import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { TrainCompositionService } from './train-composition.service';

@Controller('api/train-composition')
export class TrainCompositionController {
  constructor(private readonly trainComposition: TrainCompositionService) {}

  @Post('stations-meta')
  async stationsMeta(
    @Body()
    body: {
      trainNumber?: string;
      journeyDate?: string;
      /** Boarding / station to resolve chart times for (DB then IRCTC composition). */
      sourceStation?: string;
    },
  ) {
    const trainNumber = String(body?.trainNumber ?? '').trim();
    const journeyDate = String(body?.journeyDate ?? '')
      .trim()
      .slice(0, 10);
    const sourceStation = String(body?.sourceStation ?? '').trim();
    if (!trainNumber || !journeyDate || !sourceStation) {
      throw new BadRequestException(
        'trainNumber, journeyDate (YYYY-MM-DD), and sourceStation are required',
      );
    }
    const station = await this.trainComposition.fetchSourceStationChartMeta({
      trainNumber,
      journeyDate,
      sourceStation,
    });
    return { stations: [station] };
  }
}
