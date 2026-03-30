import { getApiUrl, getAuthHeaders } from "./api";

/** Payload shape returned on the final SSE `result` event (matches backend Service2CheckResult). */
export type Service2CheckStreamResult = Record<string, unknown>;

export type Service2CheckStreamProgress =
  | {
      phase: "irctc_complete";
      vacantSegmentCount: number;
      vacantBerthApiError: string | null;
    }
  | { phase: "ai_started" };

export async function fetchService2CheckStream(
  body: Record<string, unknown>,
  onProgress?: (event: Service2CheckStreamProgress) => void,
): Promise<Service2CheckStreamResult> {
  const url = `${getApiUrl()}/api/service2/check/stream`;
  const res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (j.message != null) {
        message = Array.isArray(j.message)
          ? j.message.join(", ")
          : j.message;
      }
    } catch {
      /* use plain text */
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: Service2CheckStreamResult | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      const dataStr = dataLines.join("\n");
      if (!dataStr) continue;
      const data = JSON.parse(dataStr) as unknown;
      if (eventName === "progress") {
        onProgress?.(data as Service2CheckStreamProgress);
      } else if (eventName === "result") {
        finalResult = data as Service2CheckStreamResult;
      } else if (eventName === "error") {
        streamError =
          typeof (data as { message?: unknown }).message === "string"
            ? (data as { message: string }).message
            : "Stream error";
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
  if (!finalResult) {
    throw new Error("No result from server");
  }
  return finalResult;
}
