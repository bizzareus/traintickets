import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3009";

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
    if (!res.ok) {
      notFound();
    }
    const data = await res.json();
    if (data?.url) {
      redirect(data.url);
    }
  } catch (err) {
    if ((err as Error)?.message === "NEXT_REDIRECT") {
      throw err;
    }
  }

  notFound();
}
