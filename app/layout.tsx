import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { FlowbiteInit } from "./FlowbiteInit";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://lastberth.com");

export const metadata: Metadata = {
  metadataBase: new URL(
    typeof siteUrl === "string" && siteUrl.startsWith("http")
      ? siteUrl
      : "https://lastberth.com",
  ),
  title: {
    default:
      "LastBerth – Find Confirmed Train Tickets & Best Seat Options | IRCTC",
    template: "%s | LastBerth",
  },
  description:
    "LastBerth helps you find confirmed train tickets for immediate journeys. Search your train, get the best seat options and book on IRCTC. Monitor chart time for last-minute availability.",
  keywords: [
    "train ticket",
    "confirmed ticket",
    "IRCTC",
    "train booking",
    "seat availability",
    "Indian Railways",
    "last minute train ticket",
    "chart preparation",
    "train seat finder",
    "LastBerth",
  ],
  authors: [{ name: "LastBerth", url: "https://lastberth.com" }],
  creator: "LastBerth",
  publisher: "LastBerth",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: "LastBerth",
    title: "LastBerth – Find Confirmed Train Tickets & Best Seat Options",
    description:
      "Find confirmed train tickets for immediate journeys. Search your train, get the best seat options and book on IRCTC. Monitor chart time for last-minute availability.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LastBerth – Find confirmed train tickets and best seat options",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LastBerth – Find Confirmed Train Tickets & Best Seat Options",
    description:
      "Find confirmed train tickets for immediate journeys. Search your train, get the best seat options and book on IRCTC.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  category: "travel",
  classification: "Train ticket booking and seat availability",
};

const baseUrl =
  typeof siteUrl === "string" && siteUrl.startsWith("http")
    ? siteUrl
    : "https://lastberth.com";

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "LastBerth",
  description:
    "Find confirmed train tickets for immediate journeys. Search your train, get the best seat options and book on IRCTC.",
  url: baseUrl,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${baseUrl}/?train={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FlowbiteInit />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd),
          }}
        />
        {children}
      </body>
    </html>
  );
}
