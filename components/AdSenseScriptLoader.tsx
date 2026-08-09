"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

/**
 * Loads Google AdSense asynchronously after initial page paint and main-thread idle,
 * preventing AdSense scripts (show_ads_impl.js) from delaying FCP/LCP or blocking hydration.
 */
export function AdSenseScriptLoader() {
  const [loadScript, setLoadScript] = useState(false);

  useEffect(() => {
    // Delay loading until idle or after 2 seconds
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => setLoadScript(true), {
        timeout: 3000,
      });
      return () => window.cancelIdleCallback(idleId);
    } else {
      const timer = setTimeout(() => setLoadScript(true), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!loadScript) return null;

  return (
    <Script
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2619716052518481"
      strategy="lazyOnload"
      crossOrigin="anonymous"
    />
  );
}
