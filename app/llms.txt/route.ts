import { NextResponse } from "next/server";

export async function GET() {
  const content = `# LastBerth — Indian Railways Ticket Availability & Waiting List Prediction Tool

> LastBerth helps travellers find confirmed seats, check PNR status, view station-by-station chart preparation times, and predict waiting list confirmations across Indian Railways.

## Primary Tools & Pages

- [Find Confirmed Seats](https://lastberth.com/): Search alternate seat options, segment bookings, and adjacent berth availability for any origin-destination pair.
- [PNR Status & Confirmation Prediction](https://lastberth.com/pnr-status): Check live PNR status, current seat status, and waitlist confirmation chances.
- [Vacant Berth Chart Map](https://lastberth.com/chart-vacancy): View interactive train coach maps and vacant berths released post-chart preparation.
- [Station Chart Preparation Times](https://lastberth.com/chart-times): Station-by-station reservation chart preparation schedules for 1,400+ Indian Railways trains.
- [IRCTC Train Food Menu](https://lastberth.com/irctc-train-food-menu): Comprehensive catering menu and meal prices for Vande Bharat, Rajdhani, Shatabdi, and Mail/Express trains.
- [Railway Guides & Blog](https://lastberth.com/blog): In-depth, multi-lingual guides on IRCTC rules, Tatkal booking speed hacks, refund rules, and Jan Vishwas Act fines.
- [Railway Glossary](https://lastberth.com/glossary): Definitions for Indian Railways abbreviations (GNWL, RLWL, PQWL, RAC, TTE, ARP).

## API & Data Endpoints

- Search API: GET https://lastberth.com/api/booking-v2/alternate-paths
- PNR Status API: GET https://lastberth.com/api/booking-v2/pnr/{pnr}
- Chart Times API: GET https://lastberth.com/api/chart-times-data/{trainNumber}
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
