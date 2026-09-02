"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    aclib?: {
      runBanner?: (options: { zoneId: string }) => void;
    };
  }
}

const AD_SCRIPT_RETRY_LIMIT = 20;
const AD_SCRIPT_RETRY_MS = 250;

export function HomeBannerAd({ zoneId }: { zoneId: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bannerEl = bannerRef.current;
    let cancelled = false;
    let attempts = 0;

    const mountBanner = () => {
      if (cancelled) return;

      if (typeof window.aclib?.runBanner === "function") {
        bannerEl?.replaceChildren();
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.text = `aclib.runBanner({ zoneId: ${JSON.stringify(zoneId)} });`;
        bannerEl?.appendChild(script);
        return;
      }

      attempts += 1;
      if (attempts < AD_SCRIPT_RETRY_LIMIT) {
        window.setTimeout(mountBanner, AD_SCRIPT_RETRY_MS);
      }
    };

    mountBanner();

    return () => {
      cancelled = true;
      bannerEl?.replaceChildren();
    };
  }, [zoneId]);

  return <div ref={bannerRef} />;
}

export function HomeSideAd() {
  return (
    <aside
      aria-label="Advertisement"
      className="fixed right-0 top-20 z-10 hidden h-[600px] w-[300px] 2xl:block"
    >
      <HomeBannerAd zoneId="12089966" />
    </aside>
  );
}
