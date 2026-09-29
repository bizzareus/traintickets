import { getCachedChartTimeStation } from "@/lib/chartTimes";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ trainNumber: string; stationCode: string }>;
  },
) {
  const { trainNumber, stationCode } = await params;
  if (!/^\d{5}$/.test(trainNumber) || !/^[A-Z0-9]{1,8}$/.test(stationCode)) {
    return Response.json(
      { error: "Invalid train or station" },
      { status: 400 },
    );
  }
  const station = getCachedChartTimeStation(trainNumber, stationCode);
  return station?.chartTimeLocal
    ? Response.json(station, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "Chart times are unavailable" }, { status: 404 });
}
