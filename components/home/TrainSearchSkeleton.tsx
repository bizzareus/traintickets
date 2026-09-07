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
  const toDisplay = toCode
    ? toName
      ? `${toCode} (${toName})`
      : toCode
    : null;

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
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
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
        <div className="h-1 w-full bg-slate-100 overflow-hidden">
          <div className="h-full w-1/3 bg-blue-600 animate-[pulse_1.5s_ease-in-out_infinite]" />
        </div>
      </div>

      {/* Skeleton Card List */}
      <ul className="space-y-5" role="list">
        {Array.from({ length: count }).map((_, i) => (
          <li
            key={`train-skeleton-${i}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 animate-pulse">
              {/* Left Section: Train Info, Timing & Route Placeholders */}
              <div className="flex-1 min-w-0">
                {/* Train Name & Schedule Pill */}
                <div className="flex flex-wrap items-center gap-2.5 pb-2">
                  <div className="h-5 w-44 sm:w-56 rounded-md bg-slate-200" />
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
                  <div className="flex flex-col items-center px-1 gap-1.5">
                    <div className="h-3 w-12 rounded bg-slate-100" />
                    <div className="h-0.5 w-20 sm:w-28 bg-slate-200" />
                  </div>

                  {/* Arrival */}
                  <div className="flex flex-col gap-1.5">
                    <div className="h-6 w-16 rounded bg-slate-200" />
                    <div className="h-3.5 w-24 rounded bg-slate-100" />
                  </div>
                </div>

                {/* Live scanning / status chip placeholder */}
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-6 w-56 sm:w-72 rounded-lg bg-slate-100" />
                </div>
              </div>

              {/* Right Section: Price & Booking Action Placeholders */}
              <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5 gap-3">
                <div className="flex flex-col md:items-end gap-1.5">
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
