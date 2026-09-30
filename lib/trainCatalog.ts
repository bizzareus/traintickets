import shatabdiData from "@/data/shatabdi-trains.json";
import rajdhaniData from "@/data/rajdhani-trains.json";
import garibRathData from "@/data/garib-rath-trains.json";
import vandeBharatData from "@/data/vande-bharat-trains.json";

export type StationPoint = {
  code: string;
  name: string;
};

export type TrainEntry = {
  trainNumber: string;
  trainName: string;
  trainType?: string;
  originStation: StationPoint;
  departureTime: string;
  destinationStation: StationPoint;
  arrivalTime: string;
  duration: string;
  distance: string;
  halts: number;
  classes: string[];
  slug: string;
  chartTimesUrl: string;
  foodMenuSlug?: string | null;
  foodMenuUrl?: string | null;
  trainDetailUrl: string;
};

type CatalogData = { trains: TrainEntry[] };

export type TrainCatalogType = "vande-bharat" | "shatabdi" | "rajdhani" | "garib-rath";

const DATA_MAP: Record<TrainCatalogType, CatalogData> = {
  "vande-bharat": vandeBharatData as CatalogData,
  shatabdi: shatabdiData as CatalogData,
  rajdhani: rajdhaniData as CatalogData,
  "garib-rath": garibRathData as CatalogData,
};

export function getTrains(type: TrainCatalogType): TrainEntry[] {
  return (DATA_MAP[type]?.trains ?? []) as TrainEntry[];
}

export function getTrainByNumber(
  type: TrainCatalogType,
  trainNumber: string,
): TrainEntry | null {
  const num = String(trainNumber || "").trim();
  return getTrains(type).find((t) => t.trainNumber === num) ?? null;
}

/** Returns a search redirect URL for booking a given train. */
export function buildSearchUrl(train: {
  originStation: { code: string; name?: string };
  destinationStation: { code: string; name?: string };
}): string {
  const params = new URLSearchParams({
    from: train.originStation.code.trim().toUpperCase(),
    to: train.destinationStation.code.trim().toUpperCase(),
  });
  if (train.originStation.name) params.set("fromName", train.originStation.name.trim());
  if (train.destinationStation.name) params.set("toName", train.destinationStation.name.trim());
  return `/?${params.toString()}`;
}
