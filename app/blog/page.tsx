import type { Metadata } from "next";
import Link from "next/link";
import { listBlogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: {
    absolute: "Read & Find Confirmed Train Tickets | IRCTC Booking Guides",
  },
  alternates: { canonical: "/blog" },
};

function formatYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BlogIndexPage() {
  const posts = listBlogPosts();

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl text-balance">
          Read & Find Confirmed Train Tickets: IRCTC Guides
        </h1>
        <p className="mt-2 max-w-2xl text-base text-slate-600">
          LastBerth Blog — Practical guides for finding confirmed train tickets, understanding IRCTC charting, and booking smarter railway journeys.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          No posts yet.
        </div>
      ) : (
        <ol className="space-y-4" aria-label="Blog posts">
          {posts.map((p) => (
            <li
              key={p.slug}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/blog/${p.slug}`}
                    className="text-lg font-bold text-slate-950 hover:underline"
                  >
                    {p.title}
                  </Link>
                  {p.description ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {p.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-md bg-slate-100 px-2 py-1">
                      {formatYmd(p.date)}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-1">
                      {p.readingTimeMinutes} min read
                    </span>
                    {p.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-blue-50 px-2 py-1 text-blue-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  href={`/blog/${p.slug}`}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-600 hover:text-white"
                >
                  Read
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
