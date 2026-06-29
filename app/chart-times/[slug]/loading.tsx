/**
 * Shown instantly during navigation to a chart-times page while the server
 * renders it (schedule + chart-time fetches can take a few seconds). Mirrors the
 * page layout so the transition doesn't feel like a blank/frozen click.
 */
export default function ChartTimesLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading chart times">
      {/* Breadcrumb */}
      <div className="mb-4 h-4 w-48 rounded bg-slate-200" />

      {/* Title */}
      <div className="mb-3 h-8 w-3/4 max-w-xl rounded bg-slate-200" />
      <div className="mb-6 h-4 w-2/3 max-w-md rounded bg-slate-100" />

      {/* Summary box */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-5/6 rounded bg-slate-100" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-10 bg-slate-100" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-t border-slate-100 px-4 py-3"
          >
            <div className="h-4 w-40 rounded bg-slate-100" />
            <div className="h-4 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading chart times…</span>
    </div>
  );
}
