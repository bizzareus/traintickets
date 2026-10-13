import {
  getChartTimesPageData,
  type ChartTimeStationRow,
} from "@/lib/chartTimes";
import type { RouteData } from "@/lib/seo/routes-db";

const CITY_STATIONS: Record<string, string[]> = {
  delhi: ["NDLS", "NZM"],
  mumbai: ["MMCT", "CSMT", "LTT"],
  patna: ["PNBE", "RJPB"],
  kolkata: ["HWH", "SDAH"],
  bengaluru: ["SBC", "BNC"],
  varanasi: ["BSB", "BNRS"],
  lucknow: ["LJN", "LKO"],
};

export type RouteTrain = {
  number: string;
  name: string;
  from: Pick<
    ChartTimeStationRow,
    "stationCode" | "stationName" | "departureTime" | "day"
  >;
  to: Pick<
    ChartTimeStationRow,
    "stationCode" | "stationName" | "arrivalTime" | "day"
  >;
  distanceKm: number | null;
  listedStops: number;
  via: string[];
};

/** Use committed timetable snapshots to show trains that actually serve the corridor. */
export async function getRouteTrains(route: RouteData): Promise<RouteTrain[]> {
  const origins = CITY_STATIONS[route.origin.slug] ?? [route.origin.code];
  const destinations = CITY_STATIONS[route.destination.slug] ?? [
    route.destination.code,
  ];
  const trains = await Promise.all(
    route.trainNumbers.map(async (number) => {
      const data = await getChartTimesPageData(number);
      if (!data) return null;

      const fromIndex = data.stations.findIndex((s) =>
        origins.includes(s.stationCode),
      );
      const toIndex =
        destinations
          .map((code) =>
            data.stations.findIndex(
              (s, index) => index > fromIndex && s.stationCode === code,
            ),
          )
          .find((index) => index >= 0) ?? -1;
      if (fromIndex < 0 || toIndex < 0) return null;

      const from = data.stations[fromIndex];
      const to = data.stations[toIndex];
      const distanceKm = Number(to.distance) - Number(from.distance);

      return {
        number,
        name: data.trainName,
        from,
        to,
        distanceKm:
          from.distance != null &&
          to.distance != null &&
          Number.isFinite(distanceKm) &&
          distanceKm > 0
            ? Math.round(distanceKm)
            : null,
        listedStops: toIndex - fromIndex - 1,
        via: data.stations
          .slice(fromIndex + 1, Math.min(toIndex, fromIndex + 4))
          .map((s) => s.stationName),
      };
    }),
  );
  return trains.filter((train) => train !== null);
}
