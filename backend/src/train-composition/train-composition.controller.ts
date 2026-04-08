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
      /** When true, calls IRCTC `trainComposition` for this boarding station (slower, fresh). */
      refreshFromIrctc?: unknown;
    },
  ) {
    const trainNumber = String(body?.trainNumber ?? '').trim();
    // const journeyDate = String(body?.journeyDate ?? '')
    //   .trim()
    //   .slice(0, 10);
    const sourceStation = String(body?.sourceStation ?? '').trim();
    if (!trainNumber || !sourceStation) {
      throw new BadRequestException(
        'trainNumber, journeyDate (YYYY-MM-DD), and sourceStation are required',
      );
    }
    console.log('trainNumber', trainNumber);
    console.log('sourceStation', sourceStation);
    const refreshFromIrctc = body?.refreshFromIrctc === true;
    const station = await this.trainComposition.fetchSourceStationChartMeta({
      trainNumber,
      sourceStation,
      refreshFromIrctc,
    });
    return { stations: [station] };
  }
}
