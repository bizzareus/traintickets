import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const apiUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3009";

  let destinationUrl: string | null = null;

  try {
    const reqHeaders = await headers();
    const userAgent = reqHeaders.get("user-agent") || "";
    const xForwardedFor = reqHeaders.get("x-forwarded-for") || "";
    const referer = reqHeaders.get("referer") || "";

    const res = await fetch(`${apiUrl}/api/short-link/${code}`, {
      cache: "no-store",
      headers: {
        ...(userAgent ? { "user-agent": userAgent } : {}),
        ...(xForwardedFor ? { "x-forwarded-for": xForwardedFor } : {}),
        ...(referer ? { referer } : {}),
      },
    });

    if (res.ok) {
      const data = await res.json();
      destinationUrl = data?.url ?? null;
    } else if (res.status !== 404) {
      console.error(
        `[ShortLink] Backend API error resolving "${code}": ${res.status} ${res.statusText}`,
      );
    }
  } catch (err) {
    console.error(`[ShortLink] Network error resolving "${code}":`, err);
  }

  if (destinationUrl) {
    redirect(destinationUrl);
  }

  notFound();
}
