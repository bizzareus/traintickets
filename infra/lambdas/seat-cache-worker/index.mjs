import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = process.env.TABLE_NAME || "lastberth-train-seat-cache";
const API_URL = process.env.API_URL || "https://api.lastberth.com";

/**
 * Resolve train origin and destination stations if not provided in SQS message.
 */
async function resolveTrainStations(trainNumber) {
  try {
    const res = await fetch(`${API_URL}/api/trains/${encodeURIComponent(trainNumber)}`, {
      headers: { "User-Agent": "LastBerth-SeatCacheWorker/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      from: data.originStation || data.schedule?.stationList?.[0]?.stationCode || "",
      to: data.destinationStation || data.schedule?.stationList?.slice(-1)[0]?.stationCode || "",
      classes: data.availableClasses || data.schedule?.availableClasses || [],
    };
  } catch (err) {
    console.warn(`[Worker] Failed to resolve stations for train ${trainNumber}:`, err.message);
    return null;
  }
}

/**
 * Fetch seat availability for a train on a specific journey date.
 * Calls our existing search API (/api/booking-v2/trains/search) and falls back
 * to /api/booking-v2/alternate-paths or static train classes.
 */
async function fetchTrainSeats(trainNumber, from, to, journeyDate) {
  const cleanTrainNo = String(trainNumber).trim();
  let origin = from ? String(from).trim().toUpperCase() : "";
  let dest = to ? String(to).trim().toUpperCase() : "";
  let fallbackClasses = [];

  if (!origin || !dest) {
    const resolved = await resolveTrainStations(cleanTrainNo);
    if (resolved) {
      origin = origin || resolved.from;
      dest = dest || resolved.to;
      fallbackClasses = resolved.classes || [];
    }
  }

  // 1. Primary: Call existing live trains search API
  if (origin && dest) {
    try {
      const searchUrl = `${API_URL}/api/booking-v2/trains/search?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(dest)}&date=${encodeURIComponent(journeyDate)}`;
      const res = await fetch(searchUrl, {
        headers: { "User-Agent": "LastBerth-SeatCacheWorker/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        const trainList = json?.data?.trainList || [];
        const match = trainList.find((t) => String(t.trainNumber).trim() === cleanTrainNo);

        if (match && match.availabilityCache) {
          const entries = Object.entries(match.availabilityCache);
          if (entries.length > 0) {
            return entries.map(([travelClass, info]) => {
              const status = info?.availabilityDisplayName || info?.availability || "AVAILABLE";
              const fare = info?.fare ? Number(info.fare) : undefined;
              return {
                trainNumber: cleanTrainNo,
                dateClass: `${journeyDate}#${travelClass}`,
                date: journeyDate,
                travelClass,
                status,
                fare,
                updatedAt: new Date().toISOString(),
              };
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[Worker] trains/search failed for ${cleanTrainNo} (${origin}->${dest}) on ${journeyDate}:`, err.message);
    }

    // 2. Secondary: If not found in direct search, try alternate-paths search API
    try {
      const altRes = await fetch(`${API_URL}/api/booking-v2/alternate-paths`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "LastBerth-SeatCacheWorker/1.0",
        },
        body: JSON.stringify({
          trainNumber: cleanTrainNo,
          from: origin,
          to: dest,
          date: journeyDate,
          quota: "GN",
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (altRes.ok) {
        const altJson = await altRes.json();
        const legs = altJson?.legs || [];
        const confirmedLegs = legs.filter((l) => l.segmentKind === "confirmed");

        if (confirmedLegs.length > 0) {
          const seats = [];
          for (const leg of confirmedLegs) {
            if (Array.isArray(leg.confirmedClassOptions) && leg.confirmedClassOptions.length > 0) {
              for (const opt of leg.confirmedClassOptions) {
                if (opt.travelClass) {
                  seats.push({
                    trainNumber: cleanTrainNo,
                    dateClass: `${journeyDate}#${opt.travelClass}`,
                    date: journeyDate,
                    travelClass: opt.travelClass,
                    status: opt.availabilityDisplayName || opt.availablityStatus || "AVAILABLE",
                    fare: opt.fare ? Number(opt.fare) : undefined,
                    updatedAt: new Date().toISOString(),
                  });
                }
              }
            } else if (leg.travelClass) {
              seats.push({
                trainNumber: cleanTrainNo,
                dateClass: `${journeyDate}#${leg.travelClass}`,
                date: journeyDate,
                travelClass: leg.travelClass,
                status: leg.availabilityDisplayName || leg.availablityStatus || "AVAILABLE",
                fare: leg.fare ? Number(leg.fare) : undefined,
                updatedAt: new Date().toISOString(),
              });
            }
          }
          if (seats.length > 0) {
            return seats;
          }
        }
      }
    } catch (err) {
      console.warn(`[Worker] alternate-paths failed for ${cleanTrainNo} on ${journeyDate}:`, err.message);
    }
  }

  // 3. Fallback: return default classes so table has schema rows
  const classes = fallbackClasses.length > 0 ? fallbackClasses : ["3A", "2A", "1A", "SL"];
  return classes.map((travelClass) => ({
    trainNumber: cleanTrainNo,
    dateClass: `${journeyDate}#${travelClass}`,
    date: journeyDate,
    travelClass,
    status: "CHECK_AVAILABLE",
    updatedAt: new Date().toISOString(),
  }));
}

export async function handler(event) {
  const records = event.Records || [];
  console.log(`[Worker] Received ${records.length} SQS records.`);

  const ttl = Math.floor(Date.now() / 1000) + (48 * 3600); // 48h TTL
  const itemsByKey = new Map();

  for (const record of records) {
    try {
      const { trainNumber, from, to, journeyDate } = JSON.parse(record.body);
      if (!trainNumber || !journeyDate) continue;

      const seats = await fetchTrainSeats(trainNumber, from, to, journeyDate);
      for (const seat of seats) {
        const uniqueKey = `${seat.trainNumber}#${seat.dateClass}`;
        itemsByKey.set(uniqueKey, {
          ...seat,
          ttl,
        });
      }
    } catch (err) {
      console.error("[Worker] Error processing record:", err);
    }
  }

  const items = Array.from(itemsByKey.values());
  if (items.length === 0) {
    return { status: "no_records_written" };
  }

  // DynamoDB BatchWrite supports up to 25 items per call
  const putRequests = items.map((item) => ({
    PutRequest: {
      Item: item,
    },
  }));

  const BATCH_SIZE = 25;
  for (let i = 0; i < putRequests.length; i += BATCH_SIZE) {
    const batch = putRequests.slice(i, i + BATCH_SIZE);
    try {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch,
          },
        })
      );
    } catch (err) {
      console.error(`[Worker] DynamoDB BatchWrite failed for chunk starting at ${i}:`, err);
    }
  }

  console.log(`[Worker] Successfully stored ${putRequests.length} seat items in DynamoDB.`);
  return {
    status: "ok",
    written: putRequests.length,
  };
}
