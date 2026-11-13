"use client";

import Script from "next/script";

/**
 * Monetag In-Page Push ad (zone 12250722). Like the VignetteAdvert, this is a
 * global script — it renders notification-style cards automatically and does
 * not need a specific DOM placement.
 */
export function InPagePush() {
  return (
    <Script
      id="monetag-inpage-push"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{
        __html: `(function(s){s.dataset.zone='12250722',s.src='https://nap5k.com/tag.min.js'})([document.documentElement,document.body].filter(Boolean).pop().appendChild(document.createElement('script')))`,
      }}
    />
  );
}
