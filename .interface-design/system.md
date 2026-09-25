# Admin Interface System

## Direction

- Feel: dense, calm operator tooling for checking system state quickly.
- Preserve the existing slate and indigo admin language. Use color only for status and active navigation.
- Prefer operational summaries and searchable tables over decorative charts, raw JSON, or repeated card grids.
- Keep admin pages responsive: controls stack on mobile and data tables scroll horizontally.

## Depth And Surfaces

- Use subtle borders and restrained shadows as the depth strategy.
- Page canvas: `bg-slate-50`.
- Primary content surfaces: `rounded-2xl border border-slate-200 bg-white shadow-sm`.
- Inset controls: `bg-slate-50` with `border-slate-200`; focus shifts to white with an indigo ring.
- High-priority health summaries may use `bg-slate-950 text-white` with `border-white/10` separators.
- Avoid dramatic shadows, gradients, thick borders, and mixed elevation strategies.

## Spacing And Shape

- Base spacing unit: 4px.
- Page sections: 24px gaps (`space-y-6`).
- Card padding: 16px for dense tool regions, 24px for focal status regions.
- Controls: minimum 40px height, `rounded-xl`.
- Cards and major panels: `rounded-2xl`.
- Compact badges: `rounded-md` with 6px horizontal and 2px vertical padding.

## Hierarchy

- Eyebrow: 12px semibold uppercase with wide tracking and indigo text.
- Page title: 24px bold with tight tracking.
- Supporting copy: 14px slate-500 or slate-600.
- Section title: 16px semibold.
- Metric values: 24px semibold, tight tracking, `tabular-nums`.
- Metadata: 12px slate-500; use monospace for table names and train numbers.
- Weight and text color should establish hierarchy before increasing font size.

## Status Semantics

- Healthy/available: emerald.
- Expiring or unavailable without a hard failure: amber.
- Error or destructive state: red.
- Active navigation and selected state: indigo.
- Neutral structure and metadata: slate.
- Pair color with text or labels; never communicate status through color alone.

## Navigation Pattern

- Admin navigation uses compact text links with an indigo active state.
- Keep top-level labels short, such as `Alerts`, `Cache`, and `Refunds`.
- Add an admin home card only for primary tools that deserve direct entry.
- Removed tools should lose both their navigation entry and route page.

## Cache Status Pattern

- Lead with one dark health strip that answers availability, earliest expiry, last write, and coverage counts.
- Display valid records only; count route records, seat records, and train partitions separately.
- Follow the summary with a searchable table of train numbers.
- Train rows show dates, classes, item count, expiry, and last update.
- Use compact class badges and tabular numeric columns.
- Always provide loading, empty, filtered-empty, error, and refresh states.

## Interaction

- Buttons use explicit hover, active, focus, and disabled states.
- Press feedback: `active:scale-[0.97]` for occasional actions.
- Refresh icons may spin only while loading.
- Search large lists with deferred input so typing remains responsive.
- Keep transitions short and limited to color, opacity, and transform.
