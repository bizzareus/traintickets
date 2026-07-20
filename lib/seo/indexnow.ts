export const DEFAULT_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
export const DEFAULT_INDEXNOW_KEY = "ad74c6b278624dba9b957b46b4cb9367";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

export interface IndexNowOptions {
  host?: string;
  key?: string;
  keyLocation?: string;
}

export interface IndexNowResult {
  success: boolean;
  status: number;
  message: string;
  submittedCount: number;
  host: string;
  keyLocation: string;
  details?: unknown;
}

/**
 * Extracts normalized hostname (without protocol, port, or www if non-www canonical)
 * from a full URL or hostname string.
 */
export function getHostFromUrl(urlOrHost?: string): string {
  if (!urlOrHost) {
    urlOrHost = DEFAULT_SITE_URL;
  }
  try {
    if (urlOrHost.includes("://")) {
      const parsed = new URL(urlOrHost);
      return parsed.hostname;
    }
    return urlOrHost.split("/")[0].split(":")[0];
  } catch {
    return "lastberth.com";
  }
}

/**
 * Submits a list of URLs to IndexNow (Bing, Yandex, Seznam, Naver, etc.).
 * Batching is handled automatically for batches up to 10,000 URLs per spec.
 */
export async function submitToIndexNow(
  urls: string[],
  options: IndexNowOptions = {}
): Promise<IndexNowResult[]> {
  if (!urls || urls.length === 0) {
    return [
      {
        success: false,
        status: 400,
        message: "No URLs provided for submission.",
        submittedCount: 0,
        host: "",
        keyLocation: "",
      },
    ];
  }

  const key = options.key || process.env.INDEXNOW_KEY || DEFAULT_INDEXNOW_KEY;
  const rawHost = options.host || DEFAULT_SITE_URL;
  const host = getHostFromUrl(rawHost);
  const protocol = rawHost.startsWith("http://") ? "http" : "https";
  const keyLocation =
    options.keyLocation || `${protocol}://${host}/${key}.txt`;

  // Filter and clean URLs
  const validUrls = Array.from(
    new Set(
      urls
        .map((u) => u.trim())
        .filter((u) => u.startsWith("http://") || u.startsWith("https://"))
    )
  );

  if (validUrls.length === 0) {
    return [
      {
        success: false,
        status: 400,
        message: "No valid HTTP/HTTPS URLs found in list.",
        submittedCount: 0,
        host,
        keyLocation,
      },
    ];
  }

  // IndexNow API allows up to 10,000 URLs per request
  const BATCH_SIZE = 10000;
  const results: IndexNowResult[] = [];

  for (let i = 0; i < validUrls.length; i += BATCH_SIZE) {
    const chunk = validUrls.slice(i, i + BATCH_SIZE);
    const payload = {
      host,
      key,
      keyLocation,
      urlList: chunk,
    };

    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      const status = response.status;
      let message = "";

      switch (status) {
        case 200:
          message = "URL(s) submitted successfully.";
          break;
        case 202:
          message = "URL(s) received and key location validated.";
          break;
        case 400:
          message = "Bad request: Invalid format.";
          break;
        case 403:
          message = "Forbidden: Key not valid (key not found or file mismatch).";
          break;
        case 422:
          message = "Unprocessable Entity: URLs do not belong to host or key schema invalid.";
          break;
        case 429:
          message = "Too Many Requests: Potential spam rate limit.";
          break;
        default:
          message = `HTTP ${status}: ${response.statusText}`;
      }

      results.push({
        success: status === 200 || status === 202,
        status,
        message,
        submittedCount: chunk.length,
        host,
        keyLocation,
      });
    } catch (err) {
      results.push({
        success: false,
        status: 500,
        message: err instanceof Error ? err.message : "Network error calling IndexNow API.",
        submittedCount: 0,
        host,
        keyLocation,
        details: err,
      });
    }
  }

  return results;
}
