import satori from "satori";
import {
  JourneyShareCard,
  JOURNEY_SHARE_WIDTH,
  journeyShareHeight,
  toJourneyShareData,
  type JourneyShareInput,
} from "./journeyShareCard";

export type ShareJourneyImageResult =
  | { ok: true; via: "share" | "download" }
  | {
      ok: false;
      code: "render_failed" | "share_rejected";
      message?: string;
    };

interface ShareFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}

const FONT_FILES = [
  { url: "/fonts/inter-latin-400-normal.woff", weight: 400 as const },
  { url: "/fonts/inter-latin-700-normal.woff", weight: 700 as const },
];

let fontsPromise: Promise<ShareFont[]> | null = null;

/** Bundled Inter weights (woff — satori cannot parse woff2), fetched once. */
export function loadShareFonts(): Promise<ShareFont[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      FONT_FILES.map(async ({ url, weight }) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Share font failed to load (${res.status})`);
        return {
          name: "Inter",
          data: await res.arrayBuffer(),
          weight,
          style: "normal" as const,
        };
      }),
    );
  }
  return fontsPromise;
}

/** Pure SVG render (no DOM) — also used by node tests with fs-loaded fonts. */
export function renderJourneySvg(
  input: JourneyShareInput,
  fonts: ShareFont[],
): Promise<string> {
  const data = toJourneyShareData(input);
  return satori(JourneyShareCard({ data }), {
    width: JOURNEY_SHARE_WIDTH,
    height: journeyShareHeight(data.legs.length),
    fonts,
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not rasterize share image"));
    img.src = url;
  });
}

/** Satori SVG (vector text) -> crisp 2x PNG blob. */
export async function renderJourneyPng(
  input: JourneyShareInput,
  scale = 2,
): Promise<Blob> {
  const svg = await renderJourneySvg(input, await loadShareFonts());
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = JOURNEY_SHARE_WIDTH * scale;
    canvas.height = (img.naturalHeight || JOURNEY_SHARE_WIDTH) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not rasterize share image");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) throw new Error("Could not encode share image");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Renders the journey card and opens the native share sheet (WhatsApp, etc.).
 * Falls back to downloading the PNG where file sharing is unsupported.
 */
export async function shareJourneyImage(
  input: JourneyShareInput,
  options?: {
    fileName?: string;
    title?: string;
    text?: string;
  },
): Promise<ShareJourneyImageResult> {
  const fileName = options?.fileName ?? "lastberth-journey.png";
  let blob: Blob;
  try {
    blob = await renderJourneyPng(input);
  } catch (e) {
    return { ok: false, code: "render_failed", message: errorMessage(e) };
  }

  const file = new File([blob], fileName, { type: "image/png" });
  const sharePayload: ShareData = {
    files: [file],
    title: options?.title,
    text: options?.text || undefined,
  };

  if (
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare?.(sharePayload)
  ) {
    try {
      await navigator.share(sharePayload);
      return { ok: true, via: "share" };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false, code: "share_rejected" };
      }
      return { ok: false, code: "render_failed", message: errorMessage(e) };
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, via: "download" };
  } catch (e) {
    return { ok: false, code: "render_failed", message: errorMessage(e) };
  }
}
