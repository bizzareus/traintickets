import vandeBharatData from "@/data/vande-bharat-trains.json";

export type StationPoint = {
  code: string;
  name: string;
};

export type VandeBharatTrain = {
  trainNumber: string;
  trainName: string;
  trainType: "ChairCar" | "Sleeper";
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

/**
 * Returns all 160 operational Vande Bharat trains.
 */
export function getAllVandeBharatTrains(): VandeBharatTrain[] {
  return vandeBharatData.trains as VandeBharatTrain[];
}

/**
 * Finds a specific Vande Bharat train by its train number.
 */
export function getVandeBharatTrainByNumber(trainNumber: string): VandeBharatTrain | null {
  const num = String(trainNumber || "").trim();
  const all = getAllVandeBharatTrains();
  return all.find((t) => t.trainNumber === num) || null;
}

/**
 * Returns a default travel search date (tomorrow in YYYY-MM-DD format).
 */
export function getDefaultVandeBharatSearchDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

/**
 * Builds the search redirect URL to book seats on a Vande Bharat train.
 */
export function buildVandeBharatSearchRedirectUrl(
  train: {
    originStation: { code: string; name?: string };
    destinationStation: { code: string; name?: string };
  },
  date?: string,
): string {
  const searchDate = date || getDefaultVandeBharatSearchDate();
  const params = new URLSearchParams({
    from: train.originStation.code.trim().toUpperCase(),
    to: train.destinationStation.code.trim().toUpperCase(),
    date: searchDate,
  });

  if (train.originStation.name) {
    params.set("fromName", train.originStation.name.trim());
  }
  if (train.destinationStation.name) {
    params.set("toName", train.destinationStation.name.trim());
  }

  return `/?${params.toString()}`;
}
