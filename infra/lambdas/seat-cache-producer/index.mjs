import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});
const QUEUE_URL = process.env.QUEUE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load top 500 trains from bundled JSON, with fallback
let DEFAULT_TRAINS = [];
try {
  const jsonPath = path.join(__dirname, "top-500-trains.json");
  const raw = fs.readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(raw);
  DEFAULT_TRAINS = parsed.map((t) => t.trainNumber).filter(Boolean);
} catch {
  DEFAULT_TRAINS = [
    "12951", "12952", "12301", "12302", "12309", "12310",
    "12425", "12445", "12001", "12002", "12004", "12015",
    "20818", "20817", "22439", "22440", "12261", "12262",
    "12009", "12010", "12011", "12012", "12013", "12014",
    "12017", "12018", "12019", "12020", "12025", "12026",
    "11301", "11302", "11013", "11014", "12615", "12616",
    "12847", "12848", "12931", "12932", "12954", "12958",
  ];
}

function getUpcomingDates(daysCount = 3) {
  const dates = [];
  const now = new Date();
  // IST offset +5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(istTime.getTime() + i * 24 * 60 * 60 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

export async function handler(event) {
  if (!QUEUE_URL) {
    throw new Error("QUEUE_URL environment variable is missing.");
  }

  const trainList = event?.trains || DEFAULT_TRAINS;
  const dates = event?.dates || getUpcomingDates(3);

  console.log(`[Producer] Preparing queue tasks for ${trainList.length} trains across ${dates.length} dates.`);

  const tasks = [];
  for (const trainNumber of trainList) {
    for (const journeyDate of dates) {
      tasks.push({
        trainNumber: String(trainNumber).trim(),
        journeyDate,
      });
    }
  }

  // Send to SQS in batches of 10 (SQS limit)
  let sentCount = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const chunk = tasks.slice(i, i + BATCH_SIZE);
    const entries = chunk.map((task, idx) => ({
      Id: `msg_${i + idx}_${Date.now()}`,
      MessageBody: JSON.stringify(task),
    }));

    try {
      await sqs.send(
        new SendMessageBatchCommand({
          QueueUrl: QUEUE_URL,
          Entries: entries,
        })
      );
      sentCount += chunk.length;
    } catch (err) {
      console.error(`[Producer] Failed to send batch starting at index ${i}:`, err);
    }
  }

  console.log(`[Producer] Successfully queued ${sentCount} tasks to SQS.`);
  return {
    statusCode: 200,
    queued: sentCount,
    total: tasks.length,
  };
}
