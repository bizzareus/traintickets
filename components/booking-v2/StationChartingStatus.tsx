"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import type { StationChartMetaItem } from "@/lib/trainCompositionStationsMeta";
import moment from "moment";

function parseChartDateTimeIst(ymd: string, time: string, addDays: number): moment.Moment | null {
  const datePart = ymd.trim().slice(0, 10);
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !match) return null;
  const chartMoment = moment
    .parseZone(`${datePart}T${match[1].padStart(2, "0")}:${match[2]}:00+05:30`)
    .add(addDays, "days");
  return chartMoment.isValid() ? chartMoment : null;
}

function chartMomentHasPassedIst(chartMoment: moment.Moment): boolean {
  return Date.now() > chartMoment.valueOf();
}

function formatChartMomentIst(chartMoment: moment.Moment): string {
  return chartMoment.clone().utcOffset(330).format("DD MMM, h:mm A");
}

interface Props {
  trainNumber: string;
  journeyDate: string; // YYYY-MM-DD
  stationCode: string;
  onStatusFetched?: (isLive: boolean) => void;
}

export function StationChartingStatus({ trainNumber, journeyDate, stationCode, onStatusFetched }: Props) {
  const [meta, setMeta] = useState<StationChartMetaItem | null>(null);

  useEffect(() => {
    if (!trainNumber || !journeyDate || !stationCode) return;

    const parsedDate = moment(journeyDate, ["YYYY-MM-DD", "DD-MMM-YYYY", "DD-MM-YYYY"]);
    const formattedDate = parsedDate.isValid() ? parsedDate.format("YYYY-MM-DD") : journeyDate;

    // Fetch in the background, ignoring any errors
    apiClient
      .post<{ stations: StationChartMetaItem[] }>("/api/train-composition/stations-meta", {
        trainNumber,
        journeyDate: formattedDate,
        sourceStation: stationCode,
        refreshFromIrctc: true, // Forces a hit to the traincomposition API
      })
      .then((r) => {
        if (r.data?.stations?.[0]) {
          const fetchedMeta = r.data.stations[0];
          setMeta(fetchedMeta);
          if (onStatusFetched && fetchedMeta.isLive !== undefined && fetchedMeta.isLive !== null) {
            onStatusFetched(fetchedMeta.isLive);
          }
        }
      })
      .catch(() => {});
  }, [trainNumber, journeyDate, stationCode, onStatusFetched]);

  // If no meta or no definitive live status, we don't render anything as requested
  if (!meta || meta.isLive === undefined || meta.isLive === null) return null;

  let statusContent = (
    <span className="text-amber-600 font-semibold">Not Prepared</span>
  );

  if (meta.isLive) {
    statusContent = <span className="text-emerald-600 font-bold">Prepared</span>;

    if (meta.chartTwoTime) {
      const parsedDate = moment(journeyDate, ["YYYY-MM-DD", "DD-MMM-YYYY", "DD-MM-YYYY"]);
      const formattedDate = parsedDate.isValid() ? parsedDate.format("YYYY-MM-DD") : journeyDate;
      const chartTwoMoment = parseChartDateTimeIst(formattedDate, meta.chartTwoTime, meta.chartTwoDayOffset || 0);
      
      if (chartTwoMoment && !chartMomentHasPassedIst(chartTwoMoment)) {
        statusContent = (
          <span className="text-blue-600 font-bold">
            Next at {formatChartMomentIst(chartTwoMoment)}
          </span>
        );
      }
    }
  }

  return (
    <span className="ml-2 inline-flex items-center gap-1 border-l pl-2 border-slate-300">
      <span className="text-slate-500 font-medium">Chart:</span>
      {statusContent}
    </span>
  );
}
