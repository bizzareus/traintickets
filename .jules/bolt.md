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

## 2026-09-30 - In-Memory Map Indexing vs Synchronous readdirSync Scans over Large Directories

**Learning:** Calling `fs.readdirSync` on a directory with 3,500+ static JSON files inside per-request file lookup functions introduces ~3ms synchronous filesystem blocking overhead per call ($O(N)$ string array allocations and linear `.find()` scans). Pre-building a module-level `Map<string, string>` on first access reduces path lookup time to $O(1)$ (~1 microsecond, ~175x speedup).
**Action:** Always construct an in-memory index `Map` when looking up static file paths from directories containing thousands of files instead of calling `fs.readdirSync` per request.

## 2026-09-30 - Persistent Module-Level Map Caches vs React Request Scope Cache

**Learning:** React's `cache()` only scope-memoizes calls within a single React component render pass and does not persist across HTTP requests or outside React component render trees (such as in sitemap generation `/sitemap.xml`, API handlers, or translation checks). Adding module-level `Map` caches (`postCache`, `postsListCache`, `slugsListCache`) for static file parsing (e.g. Markdown blog posts) eliminates redundant synchronous disk I/O and frontmatter re-parsing across requests, achieving ~12,000x speedup for `listBlogPosts` and ~870x speedup for `getBlogPost`.
**Action:** Always combine React's `cache()` with persistent module-level `Map` caches for static data parsed from disk so the cache survives across requests and outside React rendering contexts.

## 2026-10-01 - Persistent Module-Level Map Caches for Translation Quality Gates

**Learning:** Re-evaluating machine translation quality (`isLowQualityTranslation`) across hundreds of blog posts in sitemap generation and page renders re-ran regex text tokenization (`split(/\s+/)`), unigram loop checks, and bigram loop checks on every request pass (~548 ms). Tokenizing markdown text once into a token array and memoizing quality results and indexable language lists in module-level `Map` caches reduced warm-call execution time from ~548 ms to ~0.6 ms (~900x speedup) with zero GC allocation overhead.
**Action:** Always memoize computationally expensive text analysis gates (like LLM degeneration/quality checkers) using persistent module-level `Map` caches, and reuse token arrays rather than re-splitting text.

## 2026-10-03 - Case Sensitivity Limits of Direct String Comparison Operator vs localeCompare

**Learning:** Replacing `localeCompare` with direct string comparison operators (`<` and `>`) for mixed-case user-facing titles (such as "Chart Preparation" vs "CNF (Confirmed)") alters alphabetical sort order because ASCII comparison places uppercase characters before lowercase characters (e.g. `'N' < 'h'`), whereas `localeCompare` performs case-insensitive primary collation sorting. While `<` and `>` are ~5x faster for uniform ISO dates or zero-padded time strings, `localeCompare` is required for human-facing mixed-case title sorting.
**Action:** Only substitute `<` and `>` for `localeCompare` when sorting uniform case, ISO formatted, or numeric strings. Keep `localeCompare` when alphabetical sorting depends on case-insensitive human language collation.

## 2026-10-08 - Pre-Indexed Map Lookups for Static Train Catalog Queries

**Learning:** Calling `Array.prototype.find()` over static JSON datasets (e.g. 160+ Vande Bharat / Shatabdi / Rajdhani train catalog entries) inside per-request train lookups (`getTrainByNumber`) incurs $O(N)$ linear scan overhead per query. Pre-indexing static catalog entries into `Map<string, TrainEntry>` at module initialization converts catalog searches into $O(1)$ constant-time Map lookups (~10x-50x speedup).
**Action:** Always pre-index static JSON dataset arrays into module-level `Map` instances when querying by ID/number instead of calling `.find()` on every request.

## 2026-10-15 - Integer Weekday Modulo Arithmetic vs Inner Loop Date Allocations

**Learning:** Instantiating `new Date(time)` inside `for` loops during date range iterations (e.g., checking `runningDays` across operating dates) causes heavy V8 garbage collection pressure and object allocation overhead (~3.8x slower). Since consecutive days increment by 24h (`DAY_MS`), integer arithmetic `(fromDayOfWeek + dayIdx) % 7` computes UTC weekday indices with zero heap allocations.
**Action:** Use integer weekday modulo arithmetic `(startDayOfWeek + dayOffset) % 7` instead of allocating `new Date(timestamp)` inside loops when filtering or checking date ranges.

## 2026-10-20 - Pre-Indexed Station Map Caches for Chart Schedule Lookups

**Learning:** Calling `Array.prototype.find()` on train station lists (`readCachedFile(trainNumber)?.stations.find(...)`) during station chart schedule lookups incurs $O(N)$ linear array scan overhead per query across dozens of stations. Indexing station rows into a module-level `cachedParsedStationMap: Map<string, Map<string, ChartTimeStationRow>>` keyed by uppercase station code when train JSON data is parsed/read converts station lookups into $O(1)$ constant-time Map lookups (~10x-50x speedup with zero array allocation during lookups).
**Action:** Always pre-index nested array items into a module-level `Map` when items are queried frequently by key/code instead of scanning the array with `.find()` on every call.

## 2026-10-25 - Short-Circuit Loops vs Map FindIndex over Multi-Code Station Arrays

**Learning:** Mapping over target destination station codes (`destinations.map(...)`) and calling `Array.prototype.findIndex()` inside train schedule lookups allocates intermediate arrays and function closures while scanning the entire station list ($D \times N$ operations per train). Creating a `Set` for origin codes and using direct short-circuiting `for` loops eliminates intermediate allocations and reduces execution time by ~30%.
**Action:** Replace `destinations.map(code => array.findIndex(...)).find(...)` with direct short-circuiting `for` loops and `Set` lookups when matching multi-code station sequences across route schedules.

## 2026-10-28 - Direct UTC Timestamp Caching vs Date Object Allocation in Catalog Scans

**Learning:** Caching full `Date` objects in module-level `Map` caches (e.g. `parsedDateCache`) still requires calling `.getTime()` or allocating defensive copies (`new Date(cached.getTime())`) to avoid accidental mutation across callers. Caching primitive UTC millisecond numbers (`number | null`) in `parsedTimestampCache` enables direct numeric comparisons (`time >= fromTime && time <= toTime`), eliminating heap allocations and achieving ~38.5% speedup in festival train schedule searches.
**Action:** Always store primitive numeric UTC timestamps (`number | null`) in date parsing caches when dates are used for range filtering or comparisons rather than instantiating and caching `Date` instances.
