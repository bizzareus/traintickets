import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import { apiClient } from "@/lib/api";
import { checkSplitBookingAvailability } from "./split-booking";

describe("checkSplitBookingAvailability helper", () => {
  test("calls /api/split-booking/check-availability with expected payload and returns data", async () => {
    const mockPost = mock.method(apiClient, "post", async (url: string, body: unknown) => {
      assert.equal(url, "/api/split-booking/check-availability");
      assert.deepEqual(body, {
        trainNumber: "12002",
        quota: "GN",
        legs: [
          {
            from: "NDLS",
            to: "AGC",
            travelClass: "CC",
            boardingDate: "2026-09-20",
          },
        ],
      });
      return {
        data: {
          available: true,
          legs: [
            {
              from: "NDLS",
              to: "AGC",
              travelClass: "CC",
              boardingDate: "2026-09-20",
              status: "AVAILABLE 42",
              isConfirmed: true,
            },
          ],
        },
      };
    });

    const res = await checkSplitBookingAvailability({
      trainNumber: "12002",
      quota: "GN",
      legs: [
        {
          from: "NDLS",
          to: "AGC",
          travelClass: "CC",
          boardingDate: "2026-09-20",
        },
      ],
    });

    assert.equal(res.available, true);
    assert.equal(res.legs.length, 1);
    assert.equal(res.legs[0].status, "AVAILABLE 42");
    assert.equal(res.legs[0].isConfirmed, true);

    mockPost.mock.restore();
  });
});
