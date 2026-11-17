/**
 * Loads Google AdSense script directly in <head> for AdSense crawler verification and Auto-Ads.
 * Rendered as a standard HTML script element so it is present in the initial server-rendered HTML
 * without waiting for client-side hydration or window load events.
 */
export function AdSenseScriptLoader() {
  return (
    <script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2619716052518481"
      crossOrigin="anonymous"
    />
  );
}
