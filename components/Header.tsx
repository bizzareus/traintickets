import Link from "next/link";

export function Header() {
  return (
    <div className="sticky top-0 z-20">
      <header
        className="border-b border-slate-100 bg-white/95 backdrop-blur-sm"
        role="banner"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-blue-600"
          >
            LastBerth
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm font-semibold text-slate-700 sm:gap-x-4">
            <Link href="/chart-vacancy" className="hover:text-blue-600 transition-colors">
              Chart Vacancy
            </Link>
            <Link href="/pnr-status" className="hover:text-blue-600 transition-colors">
              PNR Status
            </Link>
            <Link href="/chart-times" className="hover:text-blue-600 transition-colors">
              Chart Times
            </Link>
            <Link href="/seat-status" className="hover:text-blue-600 transition-colors">
              Seat Status
            </Link>
            <Link href="/blog" className="hover:text-blue-600 transition-colors">
              Blog
            </Link>
          </nav>
        </div>
      </header>
    </div>
  );
}
