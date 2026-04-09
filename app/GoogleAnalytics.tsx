"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-706EQLNFKR";

/**
 * Google Analytics 4 (gtag.js). ID defaults to production property; override
 * with NEXT_PUBLIC_GA_MEASUREMENT_ID when needed.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  if (!GA_MEASUREMENT_ID || (pathname && pathname.startsWith("/admin"))) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
