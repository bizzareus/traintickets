/** Response row from `POST /api/train-composition/stations-meta` (one row per `sourceStation`). */
export type StationChartMetaItem = {
  stationCode: string;
  trainArrivalTime?: string | null;
  trainDepartureTime?: string | null;
  chartOneTime?: string | null;
  chartTwoTime?: string | null;
  chartTwoIsNextDay?: boolean;
  chartRemoteStation?: string | null;
  compositionError?: string | null;
  /** Present when times were copied from another station’s IRCTC response. */
  chartTimesFallbackFromStation?: string | null;
};
