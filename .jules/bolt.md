## 2026-09-08 - Fast String Comparison vs localeCompare in Sorting Loops
**Learning:** Using `String.prototype.localeCompare` inside `Array.prototype.sort()` comparator functions for ISO/time formatted strings ("HH:mm") introduces heavy Intl collation overhead in V8 (~5x slower). Standard string comparison operators (`<` and `>`) provide identical ordering for zero-padded time/ISO strings with much lower CPU overhead.
**Action:** Use direct comparison operators (`a < b ? -1 : a > b ? 1 : 0`) instead of `localeCompare` when sorting time strings or ISO dates.

## 2026-09-08 - Single-Pass Tokenization for Auto-Linker Performance & Correctness
**Learning:** Sequential string replacement loops ($N$ passes for $N$ terms) over Markdown text cause both $O(N)$ performance overhead and link corruption bugs when terms match target URLs or overlapping terms from earlier passes. Using a single combined regex that matches code blocks and existing markdown links first allows single-pass replacement while safely skipping syntax boundaries.
**Action:** Always combine multi-term text replacement into a single-pass regex pattern that accounts for structural delimiters (like code blocks and links) as match groups to eliminate quadratic string scans and avoid nested mutation bugs.
