/**
 * Helper to get the canonical base URL for the application across environments.
 */
export function getBaseUrl(): string {
  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://lastberth.com");

  return typeof siteUrl === "string" && siteUrl.startsWith("http")
    ? siteUrl.replace(/\/+$/, "")
    : "https://lastberth.com";
}
