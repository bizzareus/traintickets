import Link from "next/link";
import type { HomeStrings } from "@/lib/home/home-langs";
import { MobileNav, type NavLink } from "@/components/MobileNav";
import { HomeLanguageDropdown } from "@/components/home/HomeLanguageDropdown";

const DEFAULT_NAV: HomeStrings["nav"] = {
  confirmed: "Confirmed Tickets",
  chartVacancy: "Chart Vacancy",
  pnrStatus: "PNR Status",
  chartTimes: "Chart Times",
  foodMenu: "Food Menu",
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
  showLanguage = false,
}: {
  lang?: string;
  nav?: HomeStrings["nav"];
  /** Show the borderless language dropdown next to the logo (homepage only). */
  showLanguage?: boolean;
} = {}) {
  const homeHref = lang && lang !== "en" ? `/${lang}` : "/";

  // Chart Vacancy, PNR Status, Chart Times and Food Menu live in the footer now
  // (Chart Times / Food Menu as train-link columns). The logo already links home,
  // so the top nav is just the blog.
  const links: NavLink[] = [{ href: "/blog", label: nav.blog }];

  return (
    <div className="sticky top-0 z-20">
      <header
        className="relative border-b border-slate-100 bg-white/95 backdrop-blur-sm"
        role="banner"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-1">
            <Link
              href={homeHref}
              className="text-lg font-semibold tracking-tight text-blue-600"
            >
              LastBerth
            </Link>
            {showLanguage && <HomeLanguageDropdown currentLang={lang ?? "en"} />}
          </div>
          {/* Desktop inline nav (md+) */}
          <nav className="hidden items-center justify-end gap-x-4 text-sm font-semibold text-slate-700 md:flex">
            {links.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                className="transition-colors hover:text-blue-600"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {/* Mobile hamburger menu (below md) */}
          <MobileNav links={links} />
        </div>
      </header>
    </div>
  );
}
