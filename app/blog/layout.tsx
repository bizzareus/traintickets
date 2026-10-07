import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SideAdvert } from "@/components/ads/SideAdvert";

export const metadata: Metadata = {
  title: {
    default: "Read & Find Confirmed Train Tickets | IRCTC Booking Guides",
    absolute: "Read & Find Confirmed Train Tickets | IRCTC Booking Guides",
  },
  description:
    "Read practical guides, tips, and insights on finding confirmed train tickets, understanding IRCTC charting preparation, and booking smarter railway journeys on LastBerth.",
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/blog/rss.xml", title: "LastBerth Blog RSS Feed" },
      ],
    },
  },
  openGraph: {
    type: "website",
    url: "/blog",
    title: "Read & Find Confirmed Train Tickets | IRCTC Booking Guides",
    description:
      "Read practical guides, tips, and insights on finding confirmed train tickets, understanding IRCTC charting preparation, and booking smarter railway journeys on LastBerth.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Read & Find Confirmed Train Tickets | IRCTC Booking Guides",
    description:
      "Read practical guides, tips, and insights on finding confirmed train tickets, understanding IRCTC charting preparation, and booking smarter railway journeys on LastBerth.",
  },
};

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50/50 text-gray-900 antialiased">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex justify-center items-start gap-8">
          <main className="w-full max-w-3xl lg:max-w-4xl min-w-0">
            {children}
          </main>
          <div className="hidden xl:block shrink-0 sticky top-20">
            <SideAdvert utmMedium="external_website_blog" />
          </div>
        </div>
      </div>
    </div>
  );
}
