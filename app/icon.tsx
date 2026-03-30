import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const BRAND = "#2563eb";

export default function Icon() {
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
          fontSize: 15,
          fontWeight: 700,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          borderRadius: 7,
        }}
      >
        LB
      </div>
    ),
    { ...size },
  );
}
