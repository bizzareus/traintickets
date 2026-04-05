import type { Options as Html2CanvasOptions } from "html2canvas";

export type ShareDomScreenshotResult =
  | { ok: true; via: "share" | "download" }
  | {
      ok: false;
      code: "no_blob" | "capture_failed" | "share_rejected";
      message?: string;
    };

/**
 * Renders `element` to PNG and shares via the Web Share API (mobile share sheet → WhatsApp, etc.).
 * Falls back to downloading the file when `navigator.share` / `canShare` does not support files.
 * Elements with `data-screenshot-exclude` are omitted from the capture.
 */
export async function shareDomElementAsPng(
  element: HTMLElement,
  options?: {
    fileName?: string;
    title?: string;
    text?: string;
  },
): Promise<ShareDomScreenshotResult> {
  const fileName = options?.fileName ?? "screenshot.png";
  const title = options?.title ?? "Shared image";
  const text = options?.text ?? "";

  let canvas: HTMLCanvasElement;
  try {
    const html2canvas = (await import("html2canvas")).default;
    const opts: Partial<Html2CanvasOptions> = {
      scale: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2),
      useCORS: true,
      logging: false,
      ignoreElements: (node) =>
        node instanceof Element && node.hasAttribute("data-screenshot-exclude"),
      onclone: (_doc, clonedRoot) => {
        if (clonedRoot instanceof HTMLElement) {
          clonedRoot.style.overflow = "visible";
          clonedRoot.style.maxHeight = "none";
        }
      },
    };
    canvas = await html2canvas(element, opts);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "capture_failed", message };
  }

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 0.92);
  });
  if (!blob) {
    return { ok: false, code: "no_blob" };
  }

  const file = new File([blob], fileName, { type: "image/png" });
  const sharePayload: ShareData = {
    files: [file],
    title,
    text: text || undefined,
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
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, code: "capture_failed", message };
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
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "capture_failed", message };
  }
}
