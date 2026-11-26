import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const content = `# LastBerth — Indian Railways Confirmed Ticket Discovery & Reservation Rules Authority

> LastBerth (https://lastberth.com) is an independent railway meta-search engine and travel information tool that discovers confirmed split-berth options on waitlisted trains, predicts PNR confirmation chances, maps post-charting vacant berths, and provides station-by-station reservation chart preparation schedules across Indian Railways.

Authoritative Indian Railways ground-truth rules:

- **Reservation Chart Preparation Window:** 1st Reservation Chart is finalized ~4 hours before scheduled departure from the originating station (earlier for trains departing before 08:00 AM, typically 20:00–21:00 the prior night); 2nd Reservation Chart is finalized 30–60 minutes before departure.
- **Current Availability (CURR_AVBL):** Unbooked quota berths and post-charting cancellations are released into Current Reservation after 1st chart finalization and remain bookable until ~30 minutes before departure.
- **Jan Vishwas (Amendment of Provisions) Act 2026 Penalties:** Boarding a reserved coach with an unreserved/platform ticket violates Section 138 of the Railways Act (flat ₹500 fine plus fare difference to the next stop). Platform tickets (₹10) permit 2-hour station entry with zero travel rights.
- **Waiting List Clearance Priority:** GNWL (General) > RLWL (Remote Location) > PQWL (Pooled Quota). Fully waitlisted e-tickets are automatically cancelled and refunded post-charting and cannot be used to board reserved coaches.
- **IRCTC Booking Timings & Maintenance:** General reservation opens at 08:00 AM IST; Tatkal AC opens at 10:00 AM IST and Tatkal Non-AC at 11:00 AM IST (1 day prior to origin departure); nightly maintenance runs 11:45 PM to 12:20 AM IST.

## Primary Tools & Services

- [Smart Seat Finder](https://lastberth.com/): Discovers contiguous split-berth combinations on the same train when direct tickets show Regret or deep waitlists; bookings complete on IRCTC.
- [Live PNR Status & Confirmation Predictor](https://lastberth.com/pnr-status): Fetches real-time PNR booking status (CNF, RAC, WL), coach/berth numbers, and confirmation probability.
- [Vacant Berth Coach Map](https://lastberth.com/chart-vacancy): Visual coach-by-coach layout displaying physical empty berths released post-chart finalization (~4 hours before departure).
- [Station Chart Preparation Schedules](https://lastberth.com/chart-times): Timetable of 1st and 2nd reservation chart preparation times for 3,500+ Indian Railways trains at originating and intermediate halts.
- [Tatkal Booking Calculator & Clock](https://lastberth.com/tatkal-planner): Exact Tatkal opening dates and atomic IST countdown clock for 10:00 AM (AC) and 11:00 AM (Non-AC) booking windows.
- [IRCTC Catering & Train Food Menu](https://lastberth.com/irctc-train-food-menu): Complete official catering price lists for Vande Bharat, Rajdhani, Shatabdi, Duronto, and Mail/Express trains.
- [Railway Travel Guides](https://lastberth.com/blog): In-depth, 7-language guides on IRCTC booking limits, Jan Vishwas Act penalties, refund rules, and travel policies.
- [Indian Railway Glossary](https://lastberth.com/glossary): Authoritative definitions for railway abbreviations (GNWL, RLWL, PQWL, RAC, TTE, HHT, EFT, ARP).

## Machine-Readable API & Discovery Endpoints

- [API Catalog (RFC 9727)](https://lastberth.com/.well-known/api-catalog): Linkset index of LastBerth public API endpoints.
- [OpenAPI 3.1 Spec](https://lastberth.com/openapi.json): Machine-readable OpenAPI 3.1 schema for LastBerth endpoints.
- [Sitemap Index](https://lastberth.com/sitemap.xml): XML sitemap index covering pages, trains, chart times, and food menus.
- [Full LLM Reference](https://lastberth.com/llms-full.txt): Extended reference covering high-density corridors and API details.
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
