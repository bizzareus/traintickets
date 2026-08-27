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
| 2026-08-26 | `irctc executive lounge access rules` | High (~45K/mo across stations) | Layover / Cards | *IRCTC Executive Lounge: Rates, Stations & Cards (2026)* | ✅ Published |
| 2026-08-26 | `3e vs 3a difference in train` | High (~25K/mo search volume) | 83 vs 72 Berths | *3E vs 3A in Indian Railways: 83 vs 72 Berths, Fare Difference & Review* | ⏳ Queued |
| 2026-08-26 | `train delayed 3 hours refund rules` | High (~30K/mo urgency search) | Free Meals / TDR | *Train Delayed 3+ Hours? Free Food & TDR Full Refund Rules (2026)* | ⏳ Queued |
| 2026-08-26 | `bike transport by train parcel rules` | High (~50K/mo logistics search) | Parcel vs Luggage | *How to Transport Bike by Train: Parcel vs Luggage Rules & Charges (2026)* | ⏳ Queued |
| 2026-08-26 | `rail neer water bottle price complaint` | Moderate (~15K/mo consumer rights) | RailMadad 139 | *Rail Neer ₹15 MRP Rule: How to Complain for Food Overcharging on Train* | ⏳ Queued |
| 2026-08-26 | `coach position in train platform locator` | High (~60K/mo platform search) | Rake Layout | *Train Coach Position on Platform: How to Find B3, S4 & A1 Location* | ⏳ Queued |
| 2026-08-25 | `special train booking rules` | High (Seasonal / Search Demand) | 0-Series Rules | *Special Train Booking Rules: 0-Series Fares & Timings* | ✅ Published |
| 2026-08-23 | `suvidha train booking rules` | High (Seasonal Surge) | 50% Refund Rule | *Suvidha Train Rules 2026: Fares, Booking & 50% Refund Policy* | ✅ Published |
| 2026-08-22 | `diwali train ticket booking 2026` | High (Seasonal Surge) | 60-Day ARP | *Diwali & Chhath 2026 Train Booking: Dates & 60-Day Rules* | ✅ Published |
|---|---|---|---|---|---|
| 2026-08-03 | `current reservation timing irctc` | 211 | Pos 9.6 (2.37% CTR) | *Current Reservation IRCTC: Booking Timings & Fares (2026)* | ✅ Published |
| 2026-08-03 | `general quota meaning in irctc` | 240 | Pos 8.2 | *General Quota (GN) in IRCTC: Meaning, Rules & Seat Limits* | ✅ Published |
| 2026-07-31 | `tatkal token system timing` | High (Breakout) | Aug 1 Rule | *New Tatkal Ticket Booking Rules 2026: Token Timings & Counter Guide* | ✅ Published |
| 2026-07-31 | `vande bharat sleeper train routes` | High (Breakout) | 160 km/h | *Vande Bharat Sleeper Train 2026: Routes, Fares & Booking* | ✅ Published |

---

## 🛠️ Automated Triage Rules
- **Intent Match Score ≥ 50%:** Route to **Playbook A/A-CTR (Optimize Existing Page)**.
- **Intent Match Score < 50%:** Add to this table as a **New Candidate (Playbook D)**.
- **Generator Priority:** Pick the top `⏳ Queued` candidate when executing a NEW post run.

