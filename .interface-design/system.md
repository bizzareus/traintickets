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

## Customer Train Timetable Pattern

This pattern applies to customer-facing train schedules, not the admin-specific indigo palette above.

### Direction And Surfaces

- Feel: calm, compact railway timetable for quickly checking boarding, alighting, and overnight stops.
- Reference: `components/booking-v2/TrainScheduleBottomSheet.tsx`.
- Use Geist Sans with white surfaces, slate text, subtle slate dividers, and restrained blue journey accents.
- Use one continuous station timeline, not separate rounded cards for every station.
- Keep intermediate rows neutral. Highlight only boarding and alighting rows with `bg-blue-50/60`, blue station names, and explicit text badges.
- Use a blue line and markers for the selected segment; use slate for the rest of the train route. Do not rely on color alone.

### Layout And Typography

- Base spacing: 4px. Horizontal padding: 16px mobile, 24px desktop. Station-row vertical padding: 16px.
- Desktop: centered dialog, maximum width 672px (`max-w-2xl`), maximum height `85dvh`, 16px corners, subtle border and modal shadow.
- Mobile: full-width bottom sheet, maximum height `90dvh`, rounded top corners, and safe-area bottom padding.
- Keep the title, selected-route summary, and footer outside the scrolling timetable. Keep column headings sticky inside it.
- Title: 18px bold on mobile, 20px desktop. Train identity: 12px mobile, 14px desktop, muted slate with a semibold train number.
- Selected-route strip: neutral slate background, small “Your journey” label, and 14px semibold station codes separated by an arrow.
- Use a semantic table with Station, Arrival, and Departure columns. Align times right and apply `tabular-nums`; departure times use stronger weight than arrival times.
- Station names: 13px semibold mobile, 14px desktop. Allow long names to wrap instead of truncating them.
- Metadata: 11px slate text for station code and journey day. Boarding/Alighting badges use a light-blue fill and blue text.
- Footer: station count, IST timezone, and clarification that journey days are counted from the train’s origin.

### Behavior And States

- Use native `<dialog>.showModal()` for modal semantics, focus containment, and an inert background. Give it an accessible title.
- Close with Escape, the backdrop, or a labeled 44×44px close button. Restore focus to the trigger and release background scroll locking.
- Scroll the boarding station into view without forced animation; leave clearance for the sticky column header.
- Provide loading, empty, and error states. Errors offer an explicit “Try again” action; do not expose raw API errors.
- Cancel obsolete schedule requests when the dialog closes or the train changes. Reuse `apiClient` and existing time-formatting helpers.
- Regression coverage: `e2e/train-schedule.spec.ts`, including desktop/mobile layouts, 320px screens, closing/focus restoration, loading, empty results, and retry.
