import Script from "next/script";

/**
 * Loads Google AdSense script via Next.js Script component with `afterInteractive` strategy.
 * Ensures the script is present in the DOM for automated verification crawlers while loading asynchronously.
 */
export function AdSenseScriptLoader() {
  return (
    <Script
      id="adsbygoogle-init"
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2619716052518481"
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}

