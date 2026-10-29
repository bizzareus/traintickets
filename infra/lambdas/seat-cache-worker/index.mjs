const API_URL = process.env.API_URL || "https://api.lastberth.com";

/** Backend owns freshness, cache keys, and writes; SQS owns retries. */
export async function handler(event) {
  const apiKey = process.env.SEAT_CACHE_CRON_API_KEY;
  if (!apiKey) throw new Error("SEAT_CACHE_CRON_API_KEY is required");

  const batchItemFailures = [];
  for (const record of event.Records || []) {
    try {
      const { from, to, journeyDate } = JSON.parse(record.body);
      if (!from || !to || !journeyDate) throw new Error("Invalid route task");
      const response = await fetch(
        `${API_URL}/api/admin/seat-cache/warm-route`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LastBerth-SeatCacheWorker/2.0",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ from, to, date: journeyDate }),
          signal: AbortSignal.timeout(25_000),
        },
      );
      if (!response.ok)
        throw new Error(`Cache refresh failed: HTTP ${response.status}`);
    } catch (error) {
      console.error(
        `[Worker] Route refresh failed for ${record.messageId}`,
        error,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
