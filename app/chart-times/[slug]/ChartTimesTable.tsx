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
 * Train schedule with chart-preparation times. Renders a desktop table on md+ screens and
 * stacked responsive cards on mobile. Data cells are server-rendered for SEO; each row/card
 * also gets a client "Get Alert" island.
 */
export default function ChartTimesTable({
  stations,
  journeyDate,
  trainNumber,
  trainName,
  destinationCode,
  availableClasses,
}: {
  stations: ChartTimeStationRow[];
  journeyDate?: string | null;
  trainNumber: string;
  trainName: string;
  destinationCode: string;
  availableClasses?: string[];
}) {
  const alertFor = (s: ChartTimeStationRow, idx: number) =>
    s.stationCode !== destinationCode && idx < stations.length - 1 ? (
      <RowAlertButton
        trainNumber={trainNumber}
        trainName={trainName}
        stationCode={s.stationCode}
        stationName={s.stationName}
        destinationStations={stations.slice(idx + 1).map((stn) => ({
          stationCode: stn.stationCode,
          stationName: stn.stationName,
        }))}
        availableClasses={availableClasses}
        initialJourneyDate={journeyDate}
      />
    ) : null;

  return (
    <div>
      {/* Mobile view: Stacked Cards */}
      <div className="space-y-3 md:hidden">
        {stations.map((s, i) => (
          <div
            key={`mobile-${s.stationCode}-${i}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            {/* Header: Halt #, Station Name, Station Code & Day */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-semibold text-slate-600">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-bold leading-snug text-slate-900">
                    {s.stationName}
                  </h3>
                  <span className="font-mono text-xs font-medium text-slate-500">
                    ({s.stationCode})
                  </span>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {formatDay(s.day)}
              </span>
            </div>

            {/* Timing Grid: Arrival & Departure */}
            <div className="grid grid-cols-2 gap-2 py-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <span className="block font-medium text-slate-400">Arrival</span>
                <span className="font-semibold text-slate-700">
                  {s.arrivalTime || "Origin"}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <span className="block font-medium text-slate-400">Departure</span>
                <span className="font-semibold text-slate-700">
                  {s.departureTime || "Destination"}
                </span>
              </div>
            </div>

            {/* Chart Preparation Times */}
            <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
              <div>
                <span className="mb-1 block font-medium text-slate-500">
                  1st Chart Preparation Time
                </span>
                <FirstChart s={s} journeyDate={journeyDate} />
              </div>
              {s.chartTwoTimeLocal ? (
                <div>
                  <span className="mb-1 block font-medium text-slate-500">
                    2nd Chart Preparation Time
                  </span>
                  <SecondChart s={s} journeyDate={journeyDate} />
                </div>
              ) : null}
            </div>

            {/* Get Alert CTA */}
            {alertFor(s, i) && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {alertFor(s, i)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop view: Table */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
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
              <tr key={`${s.stationCode}-${i}`} className="align-top transition-colors hover:bg-slate-50/60">
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
                  {alertFor(s, i) && <div className="mt-2">{alertFor(s, i)}</div>}
                </td>
                <td className="px-4 py-3"><SecondChart s={s} journeyDate={journeyDate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
