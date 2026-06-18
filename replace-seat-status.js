const fs = require('fs');
const path = '/Users/kartikarora/Documents/personal/traintickets/components/booking-v2/SeatStatus.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add lucide-react imports
if (!content.includes('lucide-react')) {
  content = content.replace('import { apiClient } from "@/lib/api";', 'import { apiClient } from "@/lib/api";\nimport { ChevronRight, CircleCheck, X } from "lucide-react";');
}

// 2. Remove old grid components: BerthCell, BerthDetailPanel, CoachMap
const gridStart = content.indexOf('// ---------------------------------------------------------------------------');
const cellStart = content.indexOf('// BerthCell', gridStart);
if (cellStart !== -1) {
  const mapEnd = content.indexOf('// ---------------------------------------------------------------------------', content.indexOf('// CoachMap') + 50);
  const seatStatusStart = content.indexOf('export default function SeatStatus');
  // We want to replace from // BerthCell to just before export default function SeatStatus
  const startIdx = content.lastIndexOf('// ---------------------------------------------------------------------------', content.indexOf('// BerthCell'));
  const endIdx = content.indexOf('export default function SeatStatus');
  
  const replacement = `// ---------------------------------------------------------------------------
// Berth Availability List
// ---------------------------------------------------------------------------

function freeSpansOnLeg(b: BerthDetail): [string, string][] {
  const spans: [string, string][] = [];
  let currentSpan: { from: string; to: string } | null = null;

  for (const split of b.bsd) {
    if (!split.occupancy) {
      if (!currentSpan) {
        currentSpan = { from: split.from, to: split.to };
      } else {
        currentSpan.to = split.to;
      }
    } else {
      if (currentSpan) {
        spans.push([currentSpan.from, currentSpan.to]);
        currentSpan = null;
      }
    }
  }
  if (currentSpan) {
    spans.push([currentSpan.from, currentSpan.to]);
  }
  return spans;
}

const TYPE_RANK: Record<string, number> = { L: 0, SL: 1, M: 2, U: 3, SU: 4 };

function BerthAvailabilityList({
  data,
  destination,
  boarding,
}: {
  data: CoachCompositionResponse;
  destination: StationRow | null;
  boarding: StationRow;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<BerthDetail | null>(null);

  const { fullList, partList } = useMemo(() => {
    const full: BerthDetail[] = [];
    const part: BerthDetail[] = [];

    for (const b of data.bdd) {
      if (!b.enable) continue;
      
      const occupiedSplits = b.bsd.filter((s) => s.occupancy);
      if (occupiedSplits.length === 0) {
        full.push(b);
      } else if (occupiedSplits.length < b.bsd.length) {
        part.push(b);
      }
    }

    full.sort(
      (a, b) =>
        (TYPE_RANK[a.berthCode] ?? 99) - (TYPE_RANK[b.berthCode] ?? 99) ||
        a.berthNo - b.berthNo
    );

    return { fullList: full, partList: part };
  }, [data.bdd]);

  const visibleFull = expanded ? fullList : fullList.slice(0, 4);
  const hiddenCount = fullList.length - visibleFull.length;

  return (
    <div className="w-full">
      {fullList.length > 0 ? (
        <>
          <div className="mb-2.5 mt-2 flex items-center gap-2 px-0.5">
            <CircleCheck className="h-5 w-5 text-emerald-600" />
            <div className="text-base font-medium text-slate-900">
              {fullList.length} {fullList.length === 1 ? "seat" : "seats"} free your whole journey
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {visibleFull.map((b) => (
              <SeatRow
                key={b.berthNo}
                berth={b}
                tone="green"
                onClick={() => setDetail(b)}
              />
            ))}

            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded(true)}
                className="py-1.5 text-center text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                + {hiddenCount} more
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2 rounded-2xl bg-rose-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-600">
            <X className="h-8 w-8 text-white" />
          </div>
          <div className="text-lg font-medium text-rose-900">
            No seat free the whole way
          </div>
          <div className="mt-1 text-sm text-rose-700">
            {partList.length > 0
              ? "Some seats are free for part of your trip — see below."
              : "This coach is full for your journey."}
          </div>
        </div>
      )}

      {partList.length > 0 && (
        <>
          <div className="mb-2.5 mt-5 px-0.5 text-sm font-medium text-slate-500">
            Free for part of your journey
          </div>
          <div className="flex flex-col gap-2">
            {partList.map((b) => (
              <SeatRow
                key={b.berthNo}
                berth={b}
                tone="amber"
                onClick={() => setDetail(b)}
              />
            ))}
          </div>
        </>
      )}

      {detail && (
        <DetailSheet
          berth={detail}
          coach={data.coachName}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function SeatRow({
  berth,
  tone,
  onClick,
}: {
  berth: BerthDetail;
  tone: "green" | "amber";
  onClick: () => void;
}) {
  const spans = freeSpansOnLeg(berth);
  const spanText = spans.map(([a, z]) => \`\${a} → \${z}\`).join(", ");

  const c =
    tone === "green"
      ? {
          bg: "bg-emerald-50 hover:bg-emerald-100",
          num: "text-emerald-900",
          label: "text-emerald-900",
          span: "text-emerald-700",
          chev: "text-emerald-300",
        }
      : {
          bg: "bg-amber-50 hover:bg-amber-100",
          num: "text-amber-900",
          label: "text-amber-900",
          span: "text-amber-700",
          chev: "text-amber-300",
        };

  return (
    <button
      onClick={onClick}
      className={\`flex w-full items-center gap-3 rounded-xl \${c.bg} px-3.5 py-3 text-left transition active:scale-[0.99]\`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-white shadow-sm">
        <span className={\`text-[17px] font-semibold \${c.num}\`}>
          {berth.berthNo}
        </span>
      </div>
      <div className="flex-1">
        <div className={\`text-[15px] font-medium \${c.label}\`}>
          {BERTH_CODE_LABELS[berth.berthCode] ?? berth.berthCode}
        </div>
        <div className={\`text-[13px] \${c.span}\`}>
          {tone === "amber" ? "Free " : ""}
          {spanText}
        </div>
      </div>
      <ChevronRight className={\`h-[18px] w-[18px] \${c.chev}\`} />
    </button>
  );
}

function DetailSheet({
  berth,
  coach,
  onClose,
}: {
  berth: BerthDetail;
  coach: string;
  onClose: () => void;
}) {
  const occupiedCount = berth.bsd.filter((s) => s.occupancy).length;
  const booked = occupiedCount > 0;
  const spans = freeSpansOnLeg(berth);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold text-slate-900">
            Berth {berth.berthNo} · {BERTH_CODE_LABELS[berth.berthCode] ?? berth.berthCode}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!booked ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Free your whole journey · {spans.map(([a, z]) => \`\${a} → \${z}\`).join(", ")}
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Free only {spans.map(([a, z]) => \`\${a} → \${z}\`).join(", ")}
          </div>
        )}
        <div className="mt-4 text-xs text-slate-400">
          Coach {coach} 
        </div>
      </div>
    </div>
  );
}

`;

  content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
}

// 3. Replace the render part in SeatStatus where CoachMap is called
content = content.replace(
  '<CoachMap data={result} highlightBerthNo={highlightBerthNo} destination={destination} />',
  '<BerthAvailabilityList data={result} destination={destination} boarding={station!} />'
);

content = content.replace(
  '<p className="mb-5 text-xs text-gray-500">\n              Click any berth to see detailed occupancy information.\n            </p>',
  ''
);

fs.writeFileSync(path, content);
console.log('Done rewriting SeatStatus.tsx');
