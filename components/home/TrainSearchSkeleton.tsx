"use client";

interface TrainSearchSkeletonProps {
  fromCode?: string;
  fromName?: string;
  toCode?: string;
  toName?: string;
  count?: number;
}

export function TrainSearchSkeleton({
  fromCode,
  fromName,
  toCode,
  toName,
  count = 3,
}: TrainSearchSkeletonProps) {
  const fromDisplay = fromCode
    ? fromName
      ? `${fromCode} (${fromName})`
      : fromCode
    : null;
  const toDisplay = toCode ? (toName ? `${toCode} (${toName})` : toCode) : null;

  return (
    <div
      className="space-y-5"
      role="status"
      aria-label="Loading train search results"
      aria-busy="true"
    >
      <span className="sr-only">
        Searching available trains and checking seat availability...
      </span>

      {/* Top Status Shimmer Bar */}
      <div className="shadow-xs overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm font-semibold text-slate-800">
              {fromDisplay && toDisplay
                ? `Searching all trains and availability from ${fromDisplay} to ${toDisplay}...`
                : "Searching all trains and checking live availability..."}
            </p>
          </div>
        </div>
        <div className="h-1 w-full overflow-hidden bg-slate-100">
          <div className="h-full w-1/3 animate-[pulse_1.5s_ease-in-out_infinite] bg-blue-600" />
        </div>
      </div>

      {/* Skeleton Card List */}
      <ul className="space-y-5" role="list">
        {Array.from({ length: count }).map((_, i) => (
          <li
            key={`train-skeleton-${i}`}
            className="shadow-xs rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex animate-pulse flex-col justify-between gap-5 md:flex-row md:items-center">
              {/* Left Section: Train Info, Timing & Route Placeholders */}
              <div className="min-w-0 flex-1">
                {/* Train Name & Schedule Pill */}
                <div className="flex flex-wrap items-center gap-2.5 pb-2">
                  <div className="h-5 w-44 rounded-md bg-slate-200 sm:w-56" />
                  <div className="h-5 w-24 rounded-md bg-slate-100" />
                </div>

                {/* Timing & Route Row */}
                <div className="mt-3 flex flex-wrap items-center gap-4 sm:gap-6">
                  {/* Departure */}
                  <div className="flex flex-col gap-1.5">
                    <div className="h-6 w-16 rounded bg-slate-200" />
                    <div className="h-3.5 w-24 rounded bg-slate-100" />
                  </div>

                  {/* Duration visual divider */}
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <div className="h-3 w-12 rounded bg-slate-100" />
                    <div className="h-0.5 w-20 bg-slate-200 sm:w-28" />
                  </div>

                  {/* Arrival */}
                  <div className="flex flex-col gap-1.5">
                    <div className="h-6 w-16 rounded bg-slate-200" />
                    <div className="h-3.5 w-24 rounded bg-slate-100" />
                  </div>
                </div>

                {/* Live scanning / status chip placeholder */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-6 w-56 rounded-lg bg-slate-100 sm:w-72" />
                </div>
              </div>

              {/* Right Section: Price & Booking Action Placeholders */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <div className="flex flex-col gap-1.5 md:items-end">
                  <div className="h-5 w-16 rounded bg-slate-200" />
                  <div className="h-3.5 w-24 rounded bg-slate-100" />
                </div>
                <div className="h-9 w-28 rounded-lg bg-slate-200" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
