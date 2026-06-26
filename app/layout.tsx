import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import Link from "next/link";
import { GoogleAnalytics } from "./GoogleAnalytics";
import { AnalyticsProvider } from "./providers/AnalyticsProvider";
import { isIstIndianRailwaysNightlyMaintenanceWindow } from "@/lib/istRailMaintenance";
import { IstRailMaintenanceBanner } from "@/components/IstRailMaintenance";
import { listChartTimesIndex } from "@/lib/chartTimes";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
  preload: true,
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: true,
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
  },
  twitter: {
    card: "summary_large_image",
    title: "LastBerth – Find Confirmed Train Tickets & Best Seat Options",
    description:
      "Find confirmed train tickets for immediate journeys. Search your train, get the best seat options and book on IRCTC.",
  },
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/blog/rss.xml", title: "LastBerth Blog RSS Feed" },
      ],
    },
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
  const chartTimesPages = listChartTimesIndex().slice(0, 6);
  return (
    <html lang="en">
      <head>
        <Script
          id="gtm-script"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MMNZJJZ6');`,
          }}
        />
        <link rel="preconnect" href="https://us.i.posthog.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2619716052518481"
          strategy="lazyOnload"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MMNZJJZ6"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <IstRailMaintenanceBanner
          show={isIstIndianRailwaysNightlyMaintenanceWindow()}
        />
        {/* Analytics first so PostHog client chunk + eager init run before other interactive scripts */}
        <AnalyticsProvider>
          <div className="flex min-h-screen flex-col">
            <main className="flex-1">{children}</main>
            <footer className="border-t border-slate-200 bg-slate-50 py-12 text-sm text-slate-600">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-8">
                <div>
                  <h3 className="font-bold text-slate-900 mb-4">LastBerth</h3>
                  <p>Find confirmed train tickets and predict waiting list confirmations across Indian Railways.</p>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-4">Resources</h3>
                  <ul className="space-y-2">
                    <li><Link href="/seat-status" className="hover:text-blue-600">Seat Status & Coach Map</Link></li>
                    <li><Link href="/blog" className="hover:text-blue-600">Blog</Link></li>
                    <li><Link href="/glossary" className="hover:text-blue-600">Railway Glossary</Link></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-4">Top Routes</h3>
                  <ul className="space-y-2">
                    <li><Link href="/routes/delhi-to-mumbai" className="hover:text-blue-600">Delhi to Mumbai (Rajdhani 12952)</Link></li>
                    <li><Link href="/routes/delhi-to-patna" className="hover:text-blue-600">Delhi to Patna (Rajdhani 12310)</Link></li>
                    <li><Link href="/routes/mumbai-to-bengaluru" className="hover:text-blue-600">Mumbai to Bengaluru (Udyan 11301)</Link></li>
                    <li><Link href="/routes/chennai-to-bengaluru" className="hover:text-blue-600">Chennai to Bengaluru (Shatabdi 12007)</Link></li>
                    <li><Link href="/routes/kolkata-to-delhi" className="hover:text-blue-600">Kolkata to Delhi (Rajdhani 12301)</Link></li>
                    <li><Link href="/routes/mumbai-to-ahmedabad" className="hover:text-blue-600">Mumbai to Ahmedabad (Shatabdi 12009)</Link></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-4">
                    <Link href="/chart-times" className="hover:text-blue-600">Chart Times</Link>
                  </h3>
                  <ul className="space-y-2">
                    {chartTimesPages.length > 0 ? (
                      chartTimesPages.map((t) => (
                        <li key={t.slug}>
                          <Link href={`/chart-times/${t.slug}`} className="hover:text-blue-600">
                            {t.trainName || t.trainNumber} ({t.trainNumber})
                          </Link>
                        </li>
                      ))
                    ) : (
                      <li><Link href="/chart-times" className="hover:text-blue-600">Browse train chart times</Link></li>
                    )}
                  </ul>
                </div>
              </div>
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-10 pt-6 border-t border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-slate-500">
                <p>&copy; {new Date().getFullYear()} LastBerth. All rights reserved.</p>
                <nav className="flex items-center gap-4">
                  <Link href="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
                  <Link href="/terms" className="hover:text-blue-600">Terms of Service</Link>
                </nav>
              </div>
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-6 text-center text-slate-500">
                <p>
                  Made with <span aria-hidden="true">❤️</span><span className="sr-only">love</span> by{" "}
                  <a
                    href="https://linkedin.com/in/kartikarora"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Kartik
                  </a>
                </p>
              </div>
            </footer>
          </div>
        </AnalyticsProvider>
        <GoogleAnalytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd),
          }}
        />
      </body>
    </html>
  );
}
