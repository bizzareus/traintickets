import Link from "next/link";
import type { HomeStrings } from "@/lib/home/home-langs";
import { MobileNav, type NavLink } from "@/components/MobileNav";

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
}: {
  lang?: string;
  nav?: HomeStrings["nav"];
} = {}) {
  const homeHref = lang && lang !== "en" ? `/${lang}` : "/";

  const links: NavLink[] = [
    { href: homeHref, label: nav.confirmed },
    { href: "/chart-vacancy", label: nav.chartVacancy },
    { href: "/pnr-status", label: nav.pnrStatus },
    { href: "/chart-times", label: nav.chartTimes },
    { href: "/irctc-train-food-menu", label: nav.foodMenu },
    { href: "/blog", label: nav.blog },
  ];

  return (
    <div className="sticky top-0 z-20">
      <header
        className="relative border-b border-slate-100 bg-white/95 backdrop-blur-sm"
        role="banner"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={homeHref}
            className="text-lg font-semibold tracking-tight text-blue-600"
          >
            LastBerth
          </Link>
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
