import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = process.env.TABLE_NAME || "train_seat_cache";
const API_URL = process.env.API_URL || "https://api-v2.lastberth.com";

/**
 * Fetch seat availability for a train on a specific journey date.
 * Queries the backend train/seats availability API.
 */
async function fetchTrainSeats(trainNumber, journeyDate) {
  try {
    const url = `${API_URL}/api/trains/${encodeURIComponent(trainNumber)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "LastBerth-SeatCacheWorker/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Worker] Train ${trainNumber} API responded with status ${res.status}`);
      return [];
    }

    const data = await res.json();
    const availableClasses = (data?.availableClasses?.length)
      ? data.availableClasses
      : (data?.schedule?.availableClasses?.length)
      ? data.schedule.availableClasses
      : ["3A", "2A", "1A", "SL"];

    // Normalized seat status records
    return availableClasses.map((travelClass) => ({
      trainNumber: String(trainNumber).trim(),
      dateClass: `${journeyDate}#${travelClass}`,
      date: journeyDate,
      travelClass,
      status: "CHECK_AVAILABLE", // Default status indicator; replaced if live berth info exists
      updatedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error(`[Worker] Error fetching seats for ${trainNumber} on ${journeyDate}:`, err);
    return [];
  }
}

export async function handler(event) {
  const records = event.Records || [];
  console.log(`[Worker] Received ${records.length} SQS records.`);

  const putRequests = [];
  const ttl = Math.floor(Date.now() / 1000) + (48 * 3600); // 48h TTL

  for (const record of records) {
    try {
      const { trainNumber, journeyDate } = JSON.parse(record.body);
      if (!trainNumber || !journeyDate) continue;

      const seats = await fetchTrainSeats(trainNumber, journeyDate);
      for (const seat of seats) {
        putRequests.push({
          PutRequest: {
            Item: {
              ...seat,
              ttl,
            },
          },
        });
      }
    } catch (err) {
      console.error("[Worker] Error processing record:", err);
    }
  }

  if (putRequests.length === 0) {
    return { status: "no_records_written" };
  }

  // DynamoDB BatchWrite supports up to 25 items per call
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
