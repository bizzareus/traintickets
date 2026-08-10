import { redirect, notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3009";

  try {
    const res = await fetch(`${apiUrl}/api/short-link/${code}`, {
      cache: "no-store",
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
