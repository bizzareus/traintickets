"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { SideAdvert } from "@/components/ads/SideAdvert";

declare global {
  interface Window {
    aclib?: {
      runBanner?: (options: { zoneId: string }) => void;
    };
  }
}

const subscribeNoop = () => () => {};

export function HomeBannerAd({ zoneId }: { zoneId: string }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const hasAclib = useSyncExternalStore(
    subscribeNoop,
    () => typeof window !== "undefined" && typeof window.aclib?.runBanner === "function",
    () => false,
  );

  useEffect(() => {
    if (!hasAclib) return;

    const bannerEl = bannerRef.current;
    if (!bannerEl) return;

    bannerEl.replaceChildren();
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.text = `aclib.runBanner({ zoneId: ${JSON.stringify(zoneId)} });`;
    bannerEl.appendChild(script);

    return () => {
      bannerEl.replaceChildren();
    };
  }, [zoneId, hasAclib]);

  if (!hasAclib) return null;

  return (
    <div className="mx-auto my-8 flex min-h-[250px] max-w-3xl items-center justify-center px-4 sm:px-6 lg:max-w-4xl">
      <div ref={bannerRef} />
    </div>
  );
}

export function HomeSideAd({
  utmMedium = "external_website_homepage",
}: {
  utmMedium?: string;
} = {}) {
  return <SideAdvert utmMedium={utmMedium} />;
}
