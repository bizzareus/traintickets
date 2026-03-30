import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BRAND = "#2563eb";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND,
          color: "#fff",
          fontSize: 88,
          fontWeight: 700,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          borderRadius: 40,
        }}
      >
        LB
      </div>
    ),
    { ...size },
  );
}
