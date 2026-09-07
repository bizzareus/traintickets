## 2026-09-07 - Fast time string parsing for train schedule duration calculations
**Learning:** Parsing time strings like `"HH:MM"` via `.split(":")` and `.map(parseInt)` in loop/sorting hot paths creates significant string and array object allocation overhead (~6-7x slower).
**Action:** Use zero-allocation character digit arithmetic (`charCodeAt(i) - 48`) for parsing formatted time strings in performance-critical code paths.
