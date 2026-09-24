"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { RouteCtaContext } from "@/lib/seo/route-detector";
import { trackAnalyticsEvent } from "@/lib/analytics/track";

type Props = {
  slug: string;
  context: RouteCtaContext;
};

export function BlogStickyMobileCta({ slug, context }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const { primaryRoute } = context;

  const getTargetUrl = () => {
    if (primaryRoute) {
      return `/?from=${primaryRoute.fromCode}&to=${primaryRoute.toCode}&fromName=${encodeURIComponent(primaryRoute.fromName)}&toName=${encodeURIComponent(primaryRoute.toName)}&utm_source=blog&utm_medium=sticky_mobile&utm_campaign=${slug}`;
    }
    return `/?utm_source=blog&utm_medium=sticky_mobile&utm_campaign=${slug}`;
  };

  const getLabel = () => {
    if (primaryRoute) {
      return `Confirmed ${primaryRoute.label} Seats`;
    }
    return "Get Confirmed Tickets";
  };

  const targetUrl = getTargetUrl();

  const handleClick = () => {
    trackAnalyticsEvent({
      name: "blog_route_cta_clicked",
      properties: {
        slug,
        cta_type: "sticky_bar",
        from: primaryRoute?.fromCode,
        to: primaryRoute?.toCode,
        destination_url: targetUrl,
      },
    });
  };

  if (dismissed) return null;

  return (
    <aside
      aria-label="Mobile Train Search Quick Access"
      className="fixed bottom-0 inset-x-0 z-40 block sm:hidden border-t border-slate-200/90 bg-white/95 backdrop-blur-md px-4 py-2.5 shadow-2xl transition-transform"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">🚆</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">
              {getLabel()}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              Guaranteed smart seats & split tickets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={targetUrl}
            onClick={handleClick}
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all"
          >
            Get Confirmed →
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close search banner"
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
