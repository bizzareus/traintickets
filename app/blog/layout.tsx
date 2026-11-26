import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { DEFAULT_OG_IMAGE, DEFAULT_TWITTER_IMAGE } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: {
    default: "Train Travel Guides & IRCTC Tips",
    absolute: "Train Travel Guides & IRCTC Tips | LastBerth",
  },
  description:
    "Practical guides on finding confirmed IRCTC train tickets, reservation chart preparation times, Tatkal rules, and split-berth strategies.",
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/blog/rss.xml", title: "LastBerth Blog RSS Feed" },
      ],
    },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "LastBerth",
    url: "/blog",
    title: "Train Travel Guides & IRCTC Tips | LastBerth",
    description:
      "Practical guides on finding confirmed IRCTC train tickets, reservation chart preparation times, Tatkal rules, and split-berth strategies.",
    images: [{ ...DEFAULT_OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Train Travel Guides & IRCTC Tips | LastBerth",
    description:
      "Practical guides on finding confirmed IRCTC train tickets, reservation chart preparation times, Tatkal rules, and split-berth strategies.",
    images: [DEFAULT_TWITTER_IMAGE],
  },
};

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-[100dvh] min-h-screen bg-slate-50/50 text-gray-900 antialiased">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <main className="mx-auto w-full min-w-0 max-w-3xl lg:max-w-4xl">
          {children}
        </main>
      </div>
    </div>
  );
}
