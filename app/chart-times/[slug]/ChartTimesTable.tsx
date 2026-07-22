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
    <>
      {/* Desktop / tablet: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">#</th>
              <th scope="col" className="px-4 py-3 font-semibold">Station</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">Arrival</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">Departure</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">Day</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">1st Chart Preparation Time</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">2nd Chart Preparation Time</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((s, i) => (
              <tr key={`${s.stationCode}-${i}`} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-900">{s.stationName}</span>
                  <span className="ml-1 text-slate-500">({s.stationCode})</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{s.arrivalTime || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{s.departureTime || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDay(s.day)}</td>
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

      {/* Mobile: stacked cards */}
      <div className="space-y-4 md:hidden">
        {stations.map((s, i) => (
          <div
            key={`${s.stationCode}-${i}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">
                  <span className="text-slate-400">{i + 1}.</span> {s.stationName}{" "}
                  <span className="font-normal text-slate-500">({s.stationCode})</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{formatDay(s.day)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Arrival</div>
                <div className="text-slate-700">{s.arrivalTime || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Departure</div>
                <div className="text-slate-700">{s.departureTime || "—"}</div>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">1st Chart Preparation Time</div>
                <FirstChart s={s} journeyDate={journeyDate} />
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">2nd Chart Preparation Time</div>
                <SecondChart s={s} journeyDate={journeyDate} />
              </div>
              {alertFor(s) && <div className="pt-1.5">{alertFor(s)}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
