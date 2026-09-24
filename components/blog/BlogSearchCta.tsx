"use client";

import Link from "next/link";
import { useCallback } from "react";
import type { RouteCtaContext } from "@/lib/seo/route-detector";
import { trackAnalyticsEvent } from "@/lib/analytics/track";

type Props = {
  slug: string;
  lang?: string;
  context: RouteCtaContext;
  variant?: "mid" | "bottom";
};

export function BlogSearchCta({ slug, lang = "en", context, variant = "bottom" }: Props) {
  const { intentType, primaryRoute, popularRoutes } = context;

  const handleCtaClick = useCallback(
    (ctaType: "inline_card" | "route_chip" | "tool_button", destUrl: string, from?: string, to?: string) => {
      trackAnalyticsEvent({
        name: "blog_route_cta_clicked",
        properties: {
          slug,
          cta_type: ctaType,
          from,
          to,
          destination_url: destUrl,
        },
      });
    },
    [slug]
  );

  const getCopy = () => {
    const isHindi = lang === "hi";

    switch (intentType) {
      case "festival":
        return {
          badge: isHindi ? "🎉 छठ एवं दिवाली कन्फर्म टिकट खोजें" : "🎉 FESTIVAL CONFIRMED TICKET FINDER",
          title: isHindi ? "छठ या दिवाली पर घर जा रहे हैं?" : "Going Home for Chhath or Diwali?",
          subtitle: isHindi
            ? "सीधी ट्रेनों में REGRET / वेटिंग लिस्ट है? कन्फर्म स्पेशल ट्रेनें और स्प्लिट-सीट विकल्प खोजें।"
            : "Direct trains showing REGRET? Find confirmed festival specials and split-journey contiguous seats.",
          buttonText: isHindi
            ? (primaryRoute ? `${primaryRoute.label.replace(" ➔ ", " से ")} कन्फर्म टिकट →` : "दिल्ली से पटना कन्फर्म टिकट →")
            : (primaryRoute ? `Confirmed Tickets from ${primaryRoute.label.replace(" ➔ ", " to ")} →` : "Confirmed Tickets from Delhi to Patna →"),
          buttonUrl: primaryRoute
            ? `/?from=${primaryRoute.fromCode}&to=${primaryRoute.toCode}&fromName=${encodeURIComponent(primaryRoute.fromName)}&toName=${encodeURIComponent(primaryRoute.toName)}&utm_source=blog&utm_medium=festival_cta&utm_campaign=${slug}`
            : `/?utm_source=blog&utm_medium=festival_cta&utm_campaign=${slug}`,
        };
      case "vandebharat":
        return {
          badge: isHindi ? "🚄 वंदे भारत ट्रेन एवं सीटें" : "🚄 VANDE BHARAT SEATS & SCHEDULE",
          title: isHindi ? "वंदे भारत से यात्रा की योजना बना रहे हैं?" : "Planning a Vande Bharat Trip?",
          subtitle: isHindi
            ? "लाइव सीट उपलब्धता, किराया, कोच लेआउट और समय सारिणी देखें।"
            : "Check live seat availability, dynamic pricing, coach layouts, and schedules for express corridors.",
          buttonText: isHindi
            ? (primaryRoute ? `${primaryRoute.label} सीटें खोजें →` : "वंदे भारत ट्रेनें खोजें →")
            : (primaryRoute ? `Search ${primaryRoute.label} Seats →` : "Search Vande Bharat Trains →"),
          buttonUrl: primaryRoute
            ? `/?from=${primaryRoute.fromCode}&to=${primaryRoute.toCode}&fromName=${encodeURIComponent(primaryRoute.fromName)}&toName=${encodeURIComponent(primaryRoute.toName)}&utm_source=blog&utm_medium=vb_cta&utm_campaign=${slug}`
            : `/?utm_source=blog&utm_medium=vb_cta&utm_campaign=${slug}`,
        };
      case "charting":
        return {
          badge: isHindi ? "⚡ कन्फर्म टिकट खोजें" : "⚡ GET CONFIRMED TICKETS",
          title: isHindi ? "कन्फर्म ट्रेन टिकट की तलाश है?" : "Need Confirmed Seats for Your Journey?",
          subtitle: isHindi
            ? "सीटें सोल्ड आउट हैं? लास्टबर्थ उसी ट्रेन में स्मार्ट स्प्लिट-टिकट और गारंटीड कन्फर्म सीटें खोजने में मदद करता है।"
            : "Direct tickets sold out? LastBerth discovers guaranteed confirmed split seats and smart route combinations.",
          buttonText: isHindi ? "कन्फर्म टिकट खोजें →" : "Get Confirmed Tickets →",
          buttonUrl: primaryRoute
            ? `/?from=${primaryRoute.fromCode}&to=${primaryRoute.toCode}&fromName=${encodeURIComponent(primaryRoute.fromName)}&toName=${encodeURIComponent(primaryRoute.toName)}&utm_source=blog&utm_medium=charting_cta&utm_campaign=${slug}`
            : `/?utm_source=blog&utm_medium=charting_cta&utm_campaign=${slug}`,
        };
      case "waitlist":
        return {
          badge: isHindi ? "⚡ स्मार्ट सीट गारंटी" : "⚡ SMART SEATS GUARANTEE",
          title: isHindi ? "वेटिंग लिस्ट (WL या RAC) से परेशान हैं?" : "Stuck on Waiting List (WL or RAC)?",
          subtitle: isHindi
            ? "उसी ट्रेन में स्प्लिट-जर्नी कन्फर्म सीटें खोजें और बिना वेटलिस्ट के यात्रा करें।"
            : "Don't gamble on confirmation chances. Search confirmed split tickets on the same train and secure your seat.",
          buttonText: isHindi ? "कन्फर्म स्प्लिट सीटें खोजें →" : "Find Confirmed Split Seats →",
          buttonUrl: primaryRoute
            ? `/?from=${primaryRoute.fromCode}&to=${primaryRoute.toCode}&fromName=${encodeURIComponent(primaryRoute.fromName)}&toName=${encodeURIComponent(primaryRoute.toName)}&utm_source=blog&utm_medium=smart_seats_cta&utm_campaign=${slug}`
            : `/?utm_source=blog&utm_medium=smart_seats_cta&utm_campaign=${slug}`,
        };
      default:
        return {
          badge: isHindi ? "⚡ कन्फर्म टिकट खोजें" : "⚡ GET CONFIRMED TICKETS",
          title: isHindi ? "कन्फर्म ट्रेन टिकट की तलाश है?" : "Looking for Confirmed Train Tickets?",
          subtitle: isHindi
            ? "लास्टबर्थ उसी ट्रेन में खाली लेग्स को जोड़कर आपको कन्फर्म सीट खोजने में मदद करता है।"
            : "LastBerth finds guaranteed seats when direct tickets are sold out by scanning contiguous empty segments on the same train.",
          buttonText: isHindi ? "कन्फर्म टिकट खोजें →" : "Get Confirmed Tickets →",
          buttonUrl: primaryRoute
            ? `/?from=${primaryRoute.fromCode}&to=${primaryRoute.toCode}&fromName=${encodeURIComponent(primaryRoute.fromName)}&toName=${encodeURIComponent(primaryRoute.toName)}&utm_source=blog&utm_medium=general_cta&utm_campaign=${slug}`
            : `/?utm_source=blog&utm_medium=general_cta&utm_campaign=${slug}`,
        };
    }
  };

  const copy = getCopy();

  return (
    <div
      className={`my-8 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50 p-5 sm:p-7 shadow-sm transition-all hover:shadow-md ${
        variant === "mid" ? "border-l-4 border-l-blue-600" : ""
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-800">
            {copy.badge}
          </span>
          <h3 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-slate-950">
            {copy.title}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {copy.subtitle}
          </p>
        </div>

        <div className="shrink-0">
          <Link
            href={copy.buttonUrl}
            onClick={() => handleCtaClick("inline_card", copy.buttonUrl, primaryRoute?.fromCode, primaryRoute?.toCode)}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 hover:shadow-lg transition-all active:scale-[0.98]"
          >
            {copy.buttonText}
          </Link>
        </div>
      </div>

      {/* 1-Click Popular Route Pills */}
      {popularRoutes.length > 0 && (
        <div className="mt-6 border-t border-blue-100/80 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
              ⚡ Get Confirmed Tickets:
            </span>
            {popularRoutes.map((r) => {
              const routeUrl = `/?from=${r.fromCode}&to=${r.toCode}&fromName=${encodeURIComponent(r.fromName)}&toName=${encodeURIComponent(r.toName)}&utm_source=blog&utm_medium=route_pill&utm_campaign=${slug}`;
              return (
                <Link
                  key={r.routeSlug}
                  href={routeUrl}
                  onClick={() => handleCtaClick("route_chip", routeUrl, r.fromCode, r.toCode)}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-all"
                >
                  <span>{r.label}</span>
                  <span className="text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
