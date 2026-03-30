import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = "#2563eb";
const BRAND_DEEP = "#1d4ed8";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DEEP} 100%)`,
          color: "#fff",
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 36,
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 32,
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
              fontWeight: 700,
            }}
          >
            LB
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>
              LastBerth
            </div>
            <div style={{ fontSize: 32, opacity: 0.92, maxWidth: 720 }}>
              Confirmed train tickets and smart seat options on IRCTC
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
