/**
 * Shown during navigation to a train food-menu page. Mirrors the food-ordering
 * layout (breadcrumb, hero, class toggle, dish rows with thumbnails).
 */
export default function TrainFoodMenuLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading food menu">
      {/* Breadcrumb */}
      <div className="mb-4 h-4 w-56 rounded bg-slate-200" />

      {/* Hero: eyebrow, title, summary */}
      <div className="mb-2 h-3 w-32 rounded bg-slate-100" />
      <div className="mb-3 h-8 w-3/4 max-w-xl rounded bg-slate-200" />
      <div className="mb-1 h-4 w-full max-w-2xl rounded bg-slate-100" />
      <div className="mb-5 h-4 w-2/3 max-w-lg rounded bg-slate-100" />

      {/* Class toggle + search */}
      <div className="mb-4 h-9 w-56 rounded-full bg-slate-100" />
      <div className="mb-6 h-11 w-full rounded-xl bg-slate-100" />

      {/* Category + dish rows */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="mb-8">
          <div className="mb-4 h-6 w-40 rounded bg-slate-200" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 h-4 w-40 rounded bg-slate-100" />
                  <div className="mb-2 h-6 w-16 rounded bg-slate-100" />
                  <div className="h-3 w-5/6 rounded bg-slate-100" />
                </div>
                <div className="h-20 w-20 shrink-0 rounded-xl bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <span className="sr-only">Loading food menu…</span>
    </div>
  );
}
