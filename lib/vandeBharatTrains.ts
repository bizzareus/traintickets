/**
 * @deprecated Use lib/trainCatalog.ts for all train type data.
 * Re-exported here for backward compatibility.
 */
import { getTrains, getTrainByNumber, buildSearchUrl, type TrainEntry } from "@/lib/trainCatalog";

export type StationPoint = { code: string; name: string };
export type VandeBharatTrain = TrainEntry;

export const getAllVandeBharatTrains = () => getTrains("vande-bharat");
export const getVandeBharatTrainByNumber = (n: string) => getTrainByNumber("vande-bharat", n);

export function getDefaultVandeBharatSearchDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

export function buildVandeBharatSearchRedirectUrl(
  train: { originStation: { code: string; name?: string }; destinationStation: { code: string; name?: string } },
  date?: string,
): string {
  const url = buildSearchUrl(train);
  if (!date) return url;
  // Append date param if provided (test compat)
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}date=${encodeURIComponent(date)}`;
}
