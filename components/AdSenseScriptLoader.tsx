import Script from "next/script";

/**
 * Loads Google AdSense script lazily during browser idle time to prevent
 * blocking LCP elements and critical rendering path resources.
 */
export function AdSenseScriptLoader() {
  return (
    <Script
      id="adsense-script"
      strategy="lazyOnload"
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2619716052518481"
      crossOrigin="anonymous"
    />
  );
}

