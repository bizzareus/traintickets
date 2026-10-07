import Image from "next/image";
import { cn } from "@/lib/utils";

export type AdvertUtmMedium =
  | "external_website_homepage"
  | "external_website_blog"
  | "external_website_food_menu"
  | "external_website_chart_times"
  | (string & {});

interface SideAdvertProps {
  className?: string;
  utmMedium?: AdvertUtmMedium;
  utmSource?: string;
  utmCampaign?: string;
}

interface MobileAdvertProps {
  className?: string;
  utmMedium?: AdvertUtmMedium;
  utmSource?: string;
  utmCampaign?: string;
}

const BASE_ADVERT_URL = "https://nariofficial.co/collection/velvet";

export function getAdvertHref({
  utmMedium = "external_website_homepage",
  utmSource = "lastberth",
  utmCampaign = "velvet",
}: {
  utmMedium?: string;
  utmSource?: string;
  utmCampaign?: string;
} = {}) {
  const url = new URL(BASE_ADVERT_URL);
  if (utmSource) url.searchParams.set("utm_source", utmSource);
  if (utmMedium) url.searchParams.set("utm_medium", utmMedium);
  if (utmCampaign) url.searchParams.set("utm_campaign", utmCampaign);
  return url.toString();
}

/**
 * Vertical skyscraper side advertisement banner (220x600).
 * Displays advert.jpeg with sponsored link to Nari Velvet Collection.
 * Accepts `utmMedium` to differentiate traffic between homepage and blogs.
 */
export function SideAdvert({
  className,
  utmMedium = "external_website_homepage",
  utmSource = "lastberth",
  utmCampaign = "velvet",
}: SideAdvertProps) {
  const href = getAdvertHref({ utmMedium, utmSource, utmCampaign });

  return (
    <aside
      aria-label="Advertisement"
      className={cn("w-[220px] shrink-0", className)}
    >
      <div className="flex flex-col items-center">
        <span className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Advertisement
        </span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="group block overflow-hidden rounded-xl border border-slate-200/80 bg-white p-1 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-md"
        >
          <Image
            src="/advert.png"
            alt="Nāri Velvet Collection — A jacket, worth keeping"
            width={220}
            height={600}
            className="rounded-lg object-cover transition-transform duration-300 group-hover:scale-[1.01]"
            priority={false}
          />
        </a>
      </div>
    </aside>
  );
}

/**
 * Horizontal banner advertisement for mobile devices (1600x400 / 4:1 ratio).
 * Displays advert_mobile.png with sponsored link to Nari Velvet Collection.
 */
export function MobileAdvert({
  className,
  utmMedium = "external_website_homepage",
  utmSource = "lastberth",
  utmCampaign = "velvet",
}: MobileAdvertProps) {
  const href = getAdvertHref({ utmMedium, utmSource, utmCampaign });

  return (
    <div
      aria-label="Advertisement"
      className={cn("mt-3 block xl:hidden", className)}
    >
      <div className="flex flex-col items-center">
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Advertisement
        </span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="group block w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white p-1 shadow-2xs transition-all duration-200 hover:border-slate-300 hover:shadow-xs"
        >
          <Image
            src="/advert_mobile.png"
            alt="Nāri Velvet Collection — A jacket, worth keeping"
            width={1600}
            height={400}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 768px, 1200px"
            className="h-auto w-full rounded-lg object-cover transition-transform duration-300 group-hover:scale-[1.005]"
            priority={false}
          />
        </a>
      </div>
    </div>
  );
}
