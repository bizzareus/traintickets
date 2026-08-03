---
name: new-keyword-candidates
description: Queue of uncovered high-impression keyword candidates extracted from weekly SEO signals for user review and daily article generation
metadata:
  node_type: memory
  type: project
---

# Weekly New Keyword Candidates Queue

This queue holds high-intent search queries extracted from weekly Google Search Console / Google Trends signals that do **NOT** match any existing page intent on LastBerth.

These candidates are queued for:
1. **User Review & Approval**
2. **Automatic Article Generation** via `daily-blog-writing` task (Playbook D - Write New).

---

## 📋 Queued Candidates for Generator Review

| Date Added | Target Keyword / Query | Impressions | Growth / Pos | Suggested Article Title | Status |
|---|---|---|---|---|---|
| 2026-08-03 | `current reservation timing irctc` | 211 | Pos 9.6 (2.37% CTR) | *Current Reservation vs Current Availability: Timings & Rules (2026)* | ⏳ Queued |
| 2026-08-03 | `general quota meaning in irctc` | 240 | Pos 8.2 | *General Quota (GN) in IRCTC: Meaning, Rules & Seat Limits* | ✅ Published |
| 2026-07-31 | `tatkal token system timing` | High (Breakout) | Aug 1 Rule | *New Tatkal Ticket Booking Rules 2026: Token Timings & Counter Guide* | ✅ Published |
| 2026-07-31 | `vande bharat sleeper train routes` | High (Breakout) | 160 km/h | *Vande Bharat Sleeper Train 2026: Routes, Fares & Booking* | ✅ Published |

---

## 🛠️ Automated Triage Rules
- **Intent Match Score ≥ 50%:** Route to **Playbook A/A-CTR (Optimize Existing Page)**.
- **Intent Match Score < 50%:** Add to this table as a **New Candidate (Playbook D)**.
