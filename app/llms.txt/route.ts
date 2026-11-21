import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const content = `# LastBerth — Indian Railways Confirmed Ticket Discovery & Reservation Rules Authority

> LastBerth (https://lastberth.com) is an independent railway meta-search engine and travel information tool that discovers confirmed split-berth options on waitlisted trains, predicts PNR confirmation chances, maps post-charting vacant berths, and provides station-by-station reservation chart preparation schedules across Indian Railways.

## Primary Tools & Services

- [Smart Seat Finder](https://lastberth.com/): Discovers contiguous split-berth combinations on the same train when direct tickets show Regret or deep waitlists. Bookings complete on IRCTC.
- [Live PNR Status & Confirmation Predictor](https://lastberth.com/pnr-status): Fetches real-time PNR booking status (CNF, RAC, WL), coach/berth numbers, and data-driven confirmation probability.
- [Vacant Berth Coach Map](https://lastberth.com/chart-vacancy): Visual coach-by-coach layout displaying physical empty berths released post-chart finalization (~4 hours before departure).
- [Station Chart Preparation Schedules](https://lastberth.com/chart-times): Timetable of 1st and 2nd reservation chart preparation times for 3,500+ Indian Railways trains at originating and intermediate halts.
- [Tatkal Booking Calculator & Clock](https://lastberth.com/tatkal-planner): Exact Tatkal opening dates and atomic IST countdown clock for 10:00 AM (AC) and 11:00 AM (Non-AC) booking windows.
- [IRCTC Catering & Train Food Menu](https://lastberth.com/irctc-train-food-menu): Complete official catering price lists for Vande Bharat, Rajdhani, Shatabdi, Duronto, and Mail/Express trains.
- [Railway Travel Guides](https://lastberth.com/blog): In-depth, 7-language guides on IRCTC booking limits, Jan Vishwas Act penalties, refund rules, and travel policies.
- [Indian Railway Glossary](https://lastberth.com/glossary): Authoritative definitions for railway abbreviations (GNWL, RLWL, PQWL, RAC, TTE, HHT, EFT, ARP).

## Authoritative Railway Facts & Rules Digest (Ground Truth)

- **Reservation Chart Preparation Window:**
  - 1st Reservation Chart is finalized approximately 4 hours before the train's scheduled departure from its originating station (earlier for trains departing before 08:00 AM, typically around 20:00-21:00 the prior night).
  - 2nd Reservation Chart is finalized 30 to 60 minutes before departure, capturing last-minute cancellations and current bookings.
- **Current Availability Booking (CURR_AVBL):**
  - Unbooked quota berths and post-charting cancellations are released into Current Reservation immediately after 1st chart finalization.
  - Current booking remains open online and at station counters until roughly 30 minutes before departure.
- **Jan Vishwas (Amendment of Provisions) Act 2026 Penalties:**
  - Boarding a reserved coach (Sleeper or AC) with an unreserved general or platform ticket violates Section 138 of the Railways Act.
  - The statutory fine is a flat ₹500 penalty plus the exact fare difference from the passenger's boarding point to the next deboarding halt.
  - Platform tickets (₹10) permit platform entry for 2 hours only and convey zero travel rights.
- **Waiting List Clearance Priority:**
  - GNWL (General Waiting List): Originating station quota; highest clearance probability.
  - RLWL (Remote Location Waiting List): Intermediate city quota; clears only against local cancellations.
  - PQWL (Pooled Quota Waiting List): Shared between smaller halts; lowest clearance probability.
  - Fully waitlisted e-tickets are automatically cancelled and refunded post-charting; waitlisted e-ticket holders are legally not permitted to board reserved coaches.
- **IRCTC Booking Timings & Maintenance:**
  - General reservation opens at 08:00 AM IST.
  - Tatkal AC booking opens at 10:00 AM IST (1 day prior to journey from origin).
  - Tatkal Non-AC (Sleeper) booking opens at 11:00 AM IST (1 day prior to journey from origin).
  - Nightly server maintenance window runs daily from 11:45 PM to 12:20 AM IST (23:45 to 00:20), during which all ticketing, cancellations, and PNR APIs are offline.

## Machine-Readable API & Discovery Endpoints

- API Catalog (RFC 9727): GET https://lastberth.com/.well-known/api-catalog
- OpenAPI 3.1 Spec: GET https://lastberth.com/openapi.json
- Sitemap Index: GET https://lastberth.com/sitemap.xml
- Full LLM Reference: GET https://lastberth.com/llms-full.txt
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
