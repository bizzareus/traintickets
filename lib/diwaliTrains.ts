import diwaliTrainsData from "@/data/diwali-special-trains.json";

export type StationPoint = {
  code: string;
  name: string;
};

export type DiwaliSpecialTrain = {
  trainNumber: string;
  trainName: string;
  trainType: string;
  zone: string;
  dateFrom: string;
  dateTo: string;
  fromStation: StationPoint;
  departureTime: string;
  toStation: StationPoint;
  arrivalTime: string;
  duration: string;
  halts: number;
  runningDays: string[];
  classes: string[];
  distance: string;
  speed: string;
  returnTrainNumber?: string;
};

export function getDiwaliSpecialTrains(): DiwaliSpecialTrain[] {
  return diwaliTrainsData.trains as DiwaliSpecialTrain[];
}
