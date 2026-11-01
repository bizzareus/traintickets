import { test } from "node:test";
import assert from "node:assert/strict";
import { handler } from "./index.mjs";

test("warmer authenticates a real refresh and reports only failed SQS records", async (t) => {
  const previousKey = process.env.SEAT_CACHE_CRON_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.SEAT_CACHE_CRON_API_KEY = "test-only";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response("", { status: calls.length === 1 ? 200 : 503 });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.SEAT_CACHE_CRON_API_KEY;
    else process.env.SEAT_CACHE_CRON_API_KEY = previousKey;
  });
  const body = JSON.stringify({
    from: "R",
    to: "G",
    journeyDate: "2030-11-05",
  });
  assert.deepEqual(
    await handler({
      Records: [
        { messageId: "ok", body },
        { messageId: "retry", body },
      ],
    }),
    { batchItemFailures: [{ itemIdentifier: "retry" }] },
  );
  assert.ok(calls[0].url.endsWith("/api/admin/seat-cache/warm-route"));
  assert.equal(calls[0].options.headers["x-api-key"], "test-only");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    from: "R",
    to: "G",
    date: "2030-11-05",
  });
});
