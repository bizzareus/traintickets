import type { ChartTimeStationRow } from "@/lib/chartTimes";
import { formatChartPrep } from "@/lib/chartTimeDisplay";
import RowAlertButton from "./RowAlertButton";

function formatDay(day?: number | null): string {
  if (day === null || day === undefined) return "—";
  return `Day ${day}`;
}

/** First-chart badge + remote charting note, or "awaiting chart data". */
function FirstChart({
  s,
  journeyDate,
}: {
  s: ChartTimeStationRow;
  journeyDate?: string | null;
}) {
  if (!s.chartTimeLocal) {
    return <span className="text-slate-400">awaiting chart data</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex w-fit items-center rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700">
        {formatChartPrep(s.chartTimeLocal, s.chartOneDayOffset, journeyDate)}
      </span>
      {s.chartRemoteStation && s.chartRemoteStation !== s.stationCode ? (
        <span className="text-xs text-slate-500">
          charted at {s.chartRemoteStation}
        </span>
      ) : null}
    </div>
  );
}

/** Second-chart badge, or "NA". */
function SecondChart({
  s,
  journeyDate,
}: {
  s: ChartTimeStationRow;
  journeyDate?: string | null;
}) {
  if (!s.chartTwoTimeLocal) {
    return <span className="font-medium text-slate-400">NA</span>;
  }
  return (
    <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
      {formatChartPrep(s.chartTwoTimeLocal, s.chartTwoDayOffset, journeyDate)}
    </span>
  );
}

/**
 * Train schedule with chart-preparation times. Renders a table on md+ screens and
 * a stacked card list on mobile. Data cells are server-rendered (present in the
 * crawled HTML); each row/card also gets a small client "Get Alert" island.
 */
export default function ChartTimesTable({
  stations,
  journeyDate,
  trainNumber,
  trainName,
  destinationCode,
}: {
  stations: ChartTimeStationRow[];
  journeyDate?: string | null;
  trainNumber: string;
  trainName: string;
  destinationCode: string;
}) {
  const alertFor = (s: ChartTimeStationRow) =>
    s.stationCode !== destinationCode ? (
      <RowAlertButton
        trainNumber={trainNumber}
        trainName={trainName}
        stationCode={s.stationCode}
        stationName={s.stationName}
        destinationCode={destinationCode}
        initialJourneyDate={journeyDate}
      />
    ) : null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm" id="chart-times-table">
        <caption className="sr-only">
          {trainName} ({trainNumber}) Station-by-Station IRCTC Reservation Chart Preparation Times and Schedule Table
        </caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
          <tr>
            <th scope="col" className="w-12 px-4 py-3 font-semibold">#</th>
            <th scope="col" className="px-4 py-3 font-semibold">Station</th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">Arrival</th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">Departure</th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">Day</th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">1st Chart Preparation Time</th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">2nd Chart Preparation Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {stations.map((s, i) => (
            <tr key={`${s.stationCode}-${i}`} className="align-top hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{i + 1}</td>
              <th scope="row" className="px-4 py-3 font-normal">
                <span className="font-semibold text-slate-900">{s.stationName}</span>
                <span className="ml-1 font-mono text-xs text-slate-500">({s.stationCode})</span>
              </th>
              <td className="whitespace-nowrap px-4 py-3 text-slate-700">{s.arrivalTime || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-700">{s.departureTime || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDay(s.day)}</td>
              <td className="px-4 py-3">
                <FirstChart s={s} journeyDate={journeyDate} />
                {alertFor(s) && <div className="mt-2">{alertFor(s)}</div>}
              </td>
              <td className="px-4 py-3"><SecondChart s={s} journeyDate={journeyDate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
