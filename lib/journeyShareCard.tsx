import type { AlternateLeg } from "@/components/booking-v2/alternatePathsTypes";
import { getStationDisplayName } from "@/components/booking-v2/alternatePathHelpers";

/**
 * Satori-rendered journey share card.
 *
 * Unlike DOM screenshotting, satori draws text as vector paths from bundled
 * fonts, so the shared image looks identical on every device. Keep styles to
 * satori's supported subset: flexbox layout, numeric spacing, hex colors and
 * font weights 400/700 (the two bundled Inter weights). No Tailwind classes,
 * shadows, or special glyphs (missing glyphs render as tofu boxes).
 */

export interface JourneyShareInput {
  trainNumber: string;
  trainName?: string | null;
  /** ISO date (YYYY-MM-DD) of the journey. */
  journeyDate: string;
  legs: AlternateLeg[];
  stationNameMap?: Record<string, string>;
  totalFare: number | null;
}

export interface JourneyShareLeg {
  segmentLabel: string;
  detailLabel: string;
  fareLabel: string;
}

export interface JourneyShareData {
  title: string;
  routeLabel: string;
  dateLabel: string;
  legs: JourneyShareLeg[];
  totalLabel: string | null;
}

export const JOURNEY_SHARE_WIDTH = 1200;

const LEG_ROW_HEIGHT = 116;
const LEG_ROW_GAP = 16;
/** Fixed chrome (brand, title, total, footer, paddings) with slack for font metrics. */
const CARD_BASE_HEIGHT = 660;

export function journeyShareHeight(legCount: number): number {
  const n = Math.max(1, legCount);
  return CARD_BASE_HEIGHT + n * LEG_ROW_HEIGHT + (n - 1) * LEG_ROW_GAP;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatShareDateLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!match) return "—";
  const month = MONTHS[Number.parseInt(match[2], 10) - 1];
  if (!month) return "—";
  return `${Number.parseInt(match[3], 10)} ${month} ${match[1]}`;
}

export function formatShareFare(fare: number): string {
  return `₹${Math.round(fare).toLocaleString("en-IN")}`;
}

function legAvailability(leg: AlternateLeg): string {
  return (
    leg.availabilityDisplayName?.trim() ||
    leg.railDataStatus?.trim() ||
    leg.availablityStatus?.trim() ||
    "Available"
  );
}

/** Confirmed legs only — realtime filler hops are not shareable tickets. */
export function toJourneyShareData(input: JourneyShareInput): JourneyShareData {
  const confirmed = input.legs.filter((leg) => leg.segmentKind === "confirmed");
  const first = confirmed[0];
  const last = confirmed[confirmed.length - 1];
  return {
    title: input.trainName?.trim()
      ? `${input.trainNumber} ${input.trainName.trim()}`
      : `Train ${input.trainNumber}`,
    routeLabel:
      first && last
        ? `${getStationDisplayName(first.from, input.stationNameMap)} → ${getStationDisplayName(last.to, input.stationNameMap)}`
        : "—",
    dateLabel: formatShareDateLabel(input.journeyDate),
    legs: confirmed.map((leg) => ({
      segmentLabel: `${getStationDisplayName(leg.from, input.stationNameMap)} → ${getStationDisplayName(leg.to, input.stationNameMap)}`,
      detailLabel: `${leg.travelClass ?? "SL"} · ${legAvailability(leg)}`,
      fareLabel: leg.fare != null ? formatShareFare(leg.fare) : "—",
    })),
    totalLabel: input.totalFare != null ? formatShareFare(input.totalFare) : null,
  };
}

export function JourneyShareCard({ data }: { data: JourneyShareData }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: JOURNEY_SHARE_WIDTH,
        height: journeyShareHeight(data.legs.length),
        backgroundColor: "#0b1e3a",
        padding: 64,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          backgroundColor: "#ffffff",
          borderRadius: 32,
          paddingTop: 56,
          paddingRight: 56,
          paddingBottom: 48,
          paddingLeft: 56,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700, color: "#0b1e3a" }}>
            LASTBERTH
          </div>
          <div style={{ fontSize: 26, fontWeight: 400, color: "#64748b" }}>
            {data.dateLabel}
          </div>
        </div>

        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: "#0f172a",
            marginTop: 20,
          }}
        >
          {data.title}
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: "#1d4ed8",
            marginTop: 8,
          }}
        >
          {data.routeLabel}
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", marginTop: 28 }}
        >
          {data.legs.map((leg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#f1f5f9",
                borderRadius: 20,
                padding: 24,
                height: LEG_ROW_HEIGHT,
                marginBottom: i === data.legs.length - 1 ? 0 : LEG_ROW_GAP,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#16a34a",
                  color: "#ffffff",
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                {String(i + 1)}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  marginLeft: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {leg.segmentLabel}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: "#16a34a",
                    marginTop: 6,
                  }}
                >
                  {leg.detailLabel}
                </div>
              </div>
              <div
                style={{ fontSize: 32, fontWeight: 700, color: "#0f172a" }}
              >
                {leg.fareLabel}
              </div>
            </div>
          ))}
        </div>

        {data.totalLabel && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 28,
            }}
          >
            <div
              style={{ fontSize: 24, fontWeight: 700, color: "#64748b" }}
            >
              TOTAL TICKET FARE
            </div>
            <div style={{ fontSize: 56, fontWeight: 700, color: "#0f172a" }}>
              {data.totalLabel}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 24,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 400, color: "#64748b" }}>
            LastBerth is an official IRCTC Agent
          </div>
        </div>
      </div>
    </div>
  );
}
