/**
 * Loads Google AdSense script via standard async script tag.
 * Avoids Next.js next/script data-nscript attribute which triggers AdSense head tag warnings.
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

