import Link from "next/link";
import type { HomeStrings } from "@/lib/home/home-i18n";

const DEFAULT_NAV: HomeStrings["nav"] = {
  confirmed: "Confirmed Tickets",
  chartVacancy: "Chart Vacancy",
  pnrStatus: "PNR Status",
  chartTimes: "Chart Times",
  blog: "Blog",
};

/**
 * Site header. Pass `lang` + `nav` on the localized homepage to translate the
 * nav labels and point "Confirmed Tickets" at that locale's home; elsewhere it
 * renders the English defaults with the un-prefixed links.
 */
export function Header({
  lang,
  nav = DEFAULT_NAV,
}: {
  lang?: string;
  nav?: HomeStrings["nav"];
} = {}) {
  const homeHref = lang && lang !== "en" ? `/${lang}` : "/";

  return (
    <div className="sticky top-0 z-20">
      <header
        className="border-b border-slate-100 bg-white/95 backdrop-blur-sm"
        role="banner"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={homeHref}
            className="text-lg font-semibold tracking-tight text-blue-600"
          >
            LastBerth
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm font-semibold text-slate-700 sm:gap-x-4">
            <Link href={homeHref} className="hover:text-blue-600 transition-colors">
              {nav.confirmed}
            </Link>
            <Link href="/chart-vacancy" className="hover:text-blue-600 transition-colors">
              {nav.chartVacancy}
            </Link>
            <Link href="/pnr-status" className="hover:text-blue-600 transition-colors">
              {nav.pnrStatus}
            </Link>
            <Link href="/chart-times" className="hover:text-blue-600 transition-colors">
              {nav.chartTimes}
            </Link>
            <Link href="/blog" className="hover:text-blue-600 transition-colors">
              {nav.blog}
            </Link>
          </nav>
        </div>
      </header>
    </div>
  );
}
