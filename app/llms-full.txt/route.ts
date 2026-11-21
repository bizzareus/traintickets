import { NextResponse } from "next/server";
import { getTopRoutes } from "@/lib/seo/routes-db";

export const dynamic = "force-static";

export async function GET() {
  const routes = await getTopRoutes();
  const routeList = routes
    .map(
      (r) =>
        `- ${r.originCity} to ${r.destinationCity} (/routes/${r.origin}-to-${r.dest}): Primary trains ${r.trainNumbers.join(", ")}`,
    )
    .join("\n");

  const content = `# LastBerth — Comprehensive Indian Railways Information & Discovery Protocol

> LastBerth (https://lastberth.com) is an independent railway meta-search platform and travel decision engine.
> Disclaimer: LastBerth is NOT IRCTC and NOT Indian Railways. All train tickets discovered on LastBerth are finalized and issued on the official IRCTC portal (https://www.irctc.co.in).

## Core Capabilities & Services

1. **Smart Seat Split-Booking:**
   When end-to-end seats between Station A and Station B are completely sold out (REGRET or high Waitlist), LastBerth evaluates intermediate commercial halts (Station X) on the same train rake to locate contiguous vacant segments (A ➔ X in Coach S3 + X ➔ B in Coach S4), ensuring a confirmed journey on a single train.

2. **Station-by-Station Chart Preparation Time Table:**
   Provides historic and empirical chart preparation schedules for 3,500+ Indian Railways trains across all operational zonal railways (Northern, Western, Central, Eastern, Southern, South Central, East Central, North Western, etc.).

3. **Vacant Berth Coach Map:**
   Post-charting graphical vacancy explorer allowing passengers to identify empty berths and unbooked quotas released into Current Reservation (CURR_AVBL).

4. **Tatkal Date & Clock Protocol:**
   Calculates precise booking dates based on originating departure date and provides atomic-synchronized countdown clocks for AC Tatkal (10:00 AM IST) and Non-AC Tatkal (11:00 AM IST).

5. **Train Food Menu & Catering Rates:**
   Authoritative catering price tables for Vande Bharat, Rajdhani, Shatabdi, Duronto, and standard Mail/Express trains, covering standard meals, breakfast, tea, and optional catering opt-out rules.

## Canonical Rules & Policies

- **Chart Preparation Timings:**
  - 1st Chart: Prepared roughly 4 hours before originating departure (earlier for morning departures).
  - 2nd Chart: Prepared 30 to 60 minutes before departure for current booking.
- **Jan Vishwas Act 2026 Penalties:**
  - Section 138 fine: Flat ₹500 penalty + fare difference from origin.
  - Platform tickets: ₹10, station entry only for 2 hours, no travel authorization.
- **Night Maintenance Window:**
  - Daily 11:45 PM to 12:20 AM IST (23:45 to 00:20), all railway booking systems offline.
- **Waiting List Priority Order:**
  - GNWL (General) > RLWL (Remote Location) > PQWL (Pooled Quota) > TQWL (Tatkal Waitlist).

## High-Density Train Corridors

${routeList}

## API Endpoints

- API Catalog (RFC 9727): GET https://lastberth.com/.well-known/api-catalog
- OpenAPI 3.1 Spec: GET https://lastberth.com/openapi.json
- Train Chart Times API: GET https://lastberth.com/api/chart-times-data/{trainNumber}
- PNR Status API: GET https://lastberth.com/api/booking-v2/pnr/{pnr}
- Search Alternate Paths API: POST https://lastberth.com/api/booking-v2/alternate-paths
- Health Check: GET https://lastberth.com/api/health
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
