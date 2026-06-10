import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center bg-slate-50/50 px-6 py-24 text-center">
      <div className="relative mb-10 flex h-48 w-48 items-center justify-center rounded-full bg-blue-50/70 shadow-inner sm:h-56 sm:w-56">
        {/* Decorative railway theme circles */}
        <div className="absolute inset-4 rounded-full border-4 border-dashed border-blue-200/80 animate-[spin_60s_linear_infinite]" />
        <div className="absolute inset-8 rounded-full border border-blue-100/60" />
        
        {/* Large 404 Text */}
        <div className="z-10 flex flex-col items-center">
          <span className="text-6xl font-black tracking-tight text-blue-600 sm:text-7xl">404</span>
          <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Track Not Found</span>
        </div>
      </div>

      <h1 className="max-w-md text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        This Train Has Left the Station
      </h1>
      
      <p className="mt-4 max-w-md text-base text-slate-600 leading-relaxed">
        We couldn&apos;t find the route or page you were looking for. It might have been moved, renamed, or is currently off the schedule.
      </p>

      {/* Helpful links grid */}
      <div className="mt-10 grid w-full max-w-sm grid-cols-2 gap-4">
        <Link
          href="/"
          className="group flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
        >
          <span className="text-3xl transition-transform duration-300 group-hover:scale-110" role="img" aria-label="Home">🏠</span>
          <span className="mt-3 text-sm font-bold text-slate-900">Home</span>
          <span className="mt-1 text-xs text-slate-500">Search trains</span>
        </Link>

        <Link
          href="/blog"
          className="group flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
        >
          <span className="text-3xl transition-transform duration-300 group-hover:scale-110" role="img" aria-label="Blog">📖</span>
          <span className="mt-3 text-sm font-bold text-slate-900">LastBerth Blog</span>
          <span className="mt-1 text-xs text-slate-500">Read guides & booking tips</span>
        </Link>
      </div>

      <div className="mt-12">
        <Link
          href="/"
          className="rounded-full bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Back to Homepage
        </Link>
      </div>
    </div>
  );
}
