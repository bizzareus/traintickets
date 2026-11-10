"use client";

import Script from "next/script";

/**
 * Vignette (interstitial) advert network script. Unlike the banner
 * `SideAdvert`, it renders nothing itself — the network serves ads when
 * visitors interact with the page. Loaded right after hydration so early
 * clicks are still monetized.
 */
export function VignetteAdvert() {
  return (
    <Script
      id="n6wxm-vignette"
      src="https://n6wxm.com/vignette.min.js"
      data-zone="12231164"
    />
  );
}
