import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

export type CachedSeatItem = {
  date: string;
  travelClass: string;
  status: string;
  updatedAt?: string;
};

const TABLE_NAME =
  process.env.DYNAMODB_SEAT_CACHE_TABLE || "lastberth-train-seat-cache";
const REGION = process.env.AWS_REGION || "ap-south-1";

const globalForDynamo = globalThis as unknown as {
  dynamoDocClient: DynamoDBDocumentClient | undefined;
};

function getDocClient(): DynamoDBDocumentClient | null {
  if (globalForDynamo.dynamoDocClient) return globalForDynamo.dynamoDocClient;

  // Don't initialize if explicitly disabled
  if (process.env.DISABLE_DYNAMODB_CACHE === "1") {
    return null;
  }

  try {
    const client = new DynamoDBClient({
      region: REGION,
      // Credentials automatically loaded from environment or EC2 IAM metadata
    });
    globalForDynamo.dynamoDocClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    return globalForDynamo.dynamoDocClient;
  } catch (err) {
    console.warn("[DynamoDB] Could not initialize DynamoDB client:", err);
    return null;
  }
}

/**
 * Fetch cached seat availability matrix for a train from DynamoDB.
 * Returns empty array if unconfigured, missing, or on read failure.
 */
export async function getTrainCachedSeats(
  trainNumber: string,
): Promise<CachedSeatItem[]> {
  const ddb = getDocClient();
  if (!ddb) return [];

  const cleanNumber = String(trainNumber || "").trim();
  if (!cleanNumber) return [];

  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "trainNumber = :tn",
        ExpressionAttributeValues: {
          ":tn": cleanNumber,
        },
        ConsistentRead: false, // 0.5 RCU per 4KB read (2x throughput for $0)
        ProjectionExpression: "#d, travelClass, #st, updatedAt",
        ExpressionAttributeNames: {
          "#d": "date",
          "#st": "status",
        },
      }),
    );

    if (!res.Items || res.Items.length === 0) {
      return [];
    }

    return res.Items.map((item) => ({
      date: String(item.date || ""),
      travelClass: String(item.travelClass || ""),
      status: String(item.status || "AVAILABLE"),
      updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
    }));
  } catch (err) {
    // Graceful fallback — don't block SSR on cache miss or DynamoDB network error
    console.warn(
      `[DynamoDB] Failed to read cached seats for train ${cleanNumber}:`,
      err,
    );
    return [];
  }
}
