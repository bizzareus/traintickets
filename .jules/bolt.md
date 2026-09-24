## 2026-09-08 - Fast String Comparison vs localeCompare in Sorting Loops
**Learning:** Using `String.prototype.localeCompare` inside `Array.prototype.sort()` comparator functions for ISO/time formatted strings ("HH:mm") introduces heavy Intl collation overhead in V8 (~5x slower). Standard string comparison operators (`<` and `>`) provide identical ordering for zero-padded time/ISO strings with much lower CPU overhead.
**Action:** Use direct comparison operators (`a < b ? -1 : a > b ? 1 : 0`) instead of `localeCompare` when sorting time strings or ISO dates.

## 2026-09-08 - Single-Pass Tokenization for Auto-Linker Performance & Correctness
**Learning:** Sequential string replacement loops ($N$ passes for $N$ terms) over Markdown text cause both $O(N)$ performance overhead and link corruption bugs when terms match target URLs or overlapping terms from earlier passes. Using a single combined regex that matches code blocks and existing markdown links first allows single-pass replacement while safely skipping syntax boundaries.
**Action:** Always combine multi-term text replacement into a single-pass regex pattern that accounts for structural delimiters (like code blocks and links) as match groups to eliminate quadratic string scans and avoid nested mutation bugs.

## 2026-09-14 - Fast Numeric Train Number Sorting vs localeCompare Numeric Option
**Learning:** Calling `String.prototype.localeCompare(..., undefined, { numeric: true })` inside array sorting callbacks creates heavy Intl Collation context overhead in V8 (~150x slower). Integer subtraction with fallback string comparison `(parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || (a < b ? -1 : a > b ? 1 : 0)` provides identical numeric ordering at near-instant CPU speeds.
**Action:** Avoid `{ numeric: true }` in `localeCompare`; use integer parsing subtraction with string tie-breaker for numeric string sorting.

## 2026-09-22 - Lightweight Tuples vs Property Spreading in Pre-Sort Maps
**Learning:** Using object rest/spread (`{ ...u, ts: Date.parse(u.date) }`) and rest destructuring (`({ ts, ...u })`) inside `.map()` prior to `.sort()` introduces significant GC allocation pressure and object copying overhead ($O(N)$ copies of every property). In addition, using falsy checks (`if (item.ts)`) fails on `0` (1970 Epoch). Creating lightweight tuple objects (`{ u, ts: u.date ? Date.parse(u.date) : null }`) and explicitly checking `ts !== null` eliminates property copying overhead and avoids falsy numeric edge cases.
**Action:** When pre-computing sort keys for objects, store references in lightweight tuples (`{ obj, key }`) and check for `null` explicitly rather than spreading properties or using falsy checks on numeric timestamps.

## 2026-09-24 - Set Hash Lookups for Array Intersection vs Filter Includes
**Learning:** Checking array membership with `Array.prototype.includes` inside `Array.prototype.filter` across list iterations creates $O(N \cdot M)$ scan loops and allocates intermediate arrays for each item. Replacing array scans with a pre-constructed `Set` and counting matches in a direct `for...of` loop yields ~2.5x speedup and eliminates array allocation GC pressure.
**Action:** Always pre-build a `Set` when matching items against a reference array inside iteration loops.
