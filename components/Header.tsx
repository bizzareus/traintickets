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
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-700">
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
