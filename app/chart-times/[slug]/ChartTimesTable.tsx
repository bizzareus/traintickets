import type { ChartTimeStationRow } from "@/lib/chartTimes";
import { formatChartPrep } from "@/lib/chartTimeDisplay";

function formatDay(day?: number | null): string {
  if (day === null || day === undefined) return "—";
  return `Day ${day}`;
}

/**
 * Full schedule of a train with a chart-preparation-time column per station.
 * Pure server-rendered markup so the table is present in the crawled HTML.
 */
export default function ChartTimesTable({
  stations,
  journeyDate,
}: {
  stations: ChartTimeStationRow[];
  journeyDate?: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              #
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Station
            </th>
            <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
              Arrival
            </th>
            <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
              Departure
            </th>
            <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
              Day
            </th>
            <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
              1st Chart Preparation Time
            </th>
            <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
              2nd Chart Preparation Time
            </th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s, i) => (
            <tr
              key={`${s.stationCode}-${i}`}
              className="border-t border-slate-100 align-top"
            >
              <td className="px-4 py-3 text-slate-500">{i + 1}</td>
              <td className="px-4 py-3">
                <span className="font-medium text-slate-900">
                  {s.stationName}
                </span>
                <span className="ml-1 text-slate-500">({s.stationCode})</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                {s.arrivalTime || "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                {s.departureTime || "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                {formatDay(s.day)}
              </td>
              <td className="px-4 py-3">
                {s.chartTimeLocal ? (
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex w-fit items-center rounded-md bg-teal-50 px-2 py-1 font-semibold text-teal-700">
                      {formatChartPrep(s.chartTimeLocal, s.chartOneDayOffset, journeyDate)}
                    </span>
                    {s.chartRemoteStation && s.chartRemoteStation !== s.stationCode ? (
                      <span className="text-xs text-slate-500">
                        charted at {s.chartRemoteStation}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-slate-400">awaiting chart data</span>
                )}
              </td>
              <td className="px-4 py-3">
                {s.chartTwoTimeLocal ? (
                  <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                    {formatChartPrep(s.chartTwoTimeLocal, s.chartTwoDayOffset, journeyDate)}
                  </span>
                ) : (
                  <span className="font-medium text-slate-400">NA</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
