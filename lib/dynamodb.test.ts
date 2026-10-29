import { test } from "node:test";
import assert from "node:assert/strict";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getTrainCachedSeats } from "./dynamodb";

test("seat matrix reads are route-specific and reject expired or legacy entries", async (t) => {
  const shared = globalThis as typeof globalThis & {
    dynamoDocClient?: DynamoDBDocumentClient;
  };
  const previous = shared.dynamoDocClient;
  const now = Date.now() / 1000;
  const base = {
    date: "2030-11-05",
    travelClass: "CC",
    status: "AVAILABLE 5",
    from: "R",
    to: "G",
    ttl: now + 3600,
    freshUntil: now + 600,
  };
  let input: unknown;
  shared.dynamoDocClient = {
    send: async (command: { input: unknown }) => {
      input = command.input;
      return {
        Items: [
          base,
          { ...base, to: "RIG" },
          { ...base, ttl: now - 1 },
          { ...base, freshUntil: now - 1 },
          { ...base, freshUntil: undefined },
        ],
      };
    },
  } as unknown as DynamoDBDocumentClient;
  t.after(() => {
    shared.dynamoDocClient = previous;
  });
  const result = await getTrainCachedSeats("22436", "r", "g");
  assert.equal(result.length, 1);
  assert.equal(result[0].from, "R");
  assert.equal(result[0].to, "G");
  assert.equal(
    (input as { ExpressionAttributeValues: Record<string, string> })
      .ExpressionAttributeValues[":route"],
    "SEAT#R#G#",
  );
});
