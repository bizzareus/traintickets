import { getChartTimesPageData } from "@/lib/chartTimes";
import { parseTrainNumberFromSlug } from "@/lib/chartTimesSlug";

export const dynamic = "force-dynamic";

/**
 * Returns the exact ChartTimesPageData JSON for a train (same code that backs the
 * /chart-times pages, so there is no generation drift). Used by the chart-times
 * sync cron job to write committed content/chart-times/*.json files.
 *
 * Optionally protected: if CHART_TIMES_SYNC_SECRET is set, the caller must send a
 * matching `x-sync-secret` header (keeps the IRCTC-hitting endpoint from public abuse).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = process.env.CHART_TIMES_SYNC_SECRET;
  if (secret && req.headers.get("x-sync-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const num = parseTrainNumberFromSlug(id) || id.replace(/\D/g, "");
  const data = num ? await getChartTimesPageData(num) : null;
  if (!data) {
    return Response.json({ error: "not found", trainNumber: num }, { status: 404 });
  }
  return Response.json(data);
}
