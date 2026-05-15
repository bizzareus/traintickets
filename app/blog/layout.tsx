import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Practical guides for finding confirmed train tickets, understanding IRCTC charting, and booking smarter journeys.",
  openGraph: {
    type: "website",
    url: "/blog",
    title: "LastBerth Blog",
    description:
      "Practical guides for finding confirmed train tickets, understanding IRCTC charting, and booking smarter journeys.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LastBerth Blog",
    description:
      "Practical guides for finding confirmed train tickets, understanding IRCTC charting, and booking smarter journeys.",
  },
};

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-gray-900 antialiased">
      <div className="sticky top-0 z-20">
        <header
          className="border-b border-slate-100 bg-white/95 backdrop-blur-sm"
          role="banner"
        >
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-blue-600"
            >
              LastBerth
            </Link>
            <nav className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <Link href="/blog" className="hover:text-slate-900">
                Blog
              </Link>
              <Link href="/search" className="hover:text-slate-900">
                Search
              </Link>
            </nav>
          </div>
        </header>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:max-w-4xl">
        {children}
      </main>
    </div>
  );
}
