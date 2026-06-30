/**
 * Shown during navigation to a train food-menu page. Mirrors the page layout
 * (breadcrumb, title, price grid, class sections) so the transition is smooth.
 */
export default function TrainFoodMenuLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading food menu">
      <div className="mb-4 h-4 w-56 rounded bg-slate-200" />
      <div className="mb-3 h-8 w-3/4 max-w-xl rounded bg-slate-200" />
      <div className="mb-6 h-4 w-2/3 max-w-md rounded bg-slate-100" />

      {/* Price grid skeleton */}
      <div className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-11 bg-slate-100" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-t border-slate-100 px-4 py-3"
          >
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="h-4 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Class section skeleton */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="mb-8">
          <div className="mb-3 h-6 w-40 rounded bg-slate-200" />
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 h-5 w-32 rounded bg-slate-100" />
                <div className="mb-2 h-4 w-full rounded bg-slate-100" />
                <div className="h-4 w-5/6 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <span className="sr-only">Loading food menu…</span>
    </div>
  );
}
