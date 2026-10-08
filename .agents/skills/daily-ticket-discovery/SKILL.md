---
name: daily-ticket-discovery
description: Scans target corridors, verifies direct Waitlist/Regret on ConfirmTkt vs confirmed split legs on LastBerth, generates daily screenshot comparison graphics, and publishes verified proof posts to @lastberth.in.
---

# Daily Ticket Discovery & Screenshot Proof Skill

You are equipped with the capability to run the daily LastBerth vs. ConfirmTkt / IRCTC ticket discovery audit and publish verified screenshot comparisons to [`@lastberth.in`](https://www.instagram.com/lastberth.in/).

## Strategy & Guidelines

Refer to the master strategy document at [docs/INSTAGRAM_CONTENT_STRATEGY.md](file:///Users/kartikarora/Documents/personal/traintickets/docs/INSTAGRAM_CONTENT_STRATEGY.md) and design specifications at [design.md](file:///Users/kartikarora/Documents/personal/traintickets/design.md).

### Core Principle
**"CONFIRMED TICKET FROM {ORIGIN} TO {DESTINATION} FOR {TRAVEL DATE}"**  
Direct, transparent messaging to travellers: *"Waitlisted end-to-end on IRCTC? We found you confirmed seats in [Train Name] [Train Number] for ₹[Fare]. Book on LastBerth.com."*

---

## Daily Execution Workflow

### Step 1: Corridor & Date Selection
Rotate across high-density waitlisted trunk corridors, scanning departure dates 1 to 5 days ahead (India time):
1. `NDLS → PNBE` (New Delhi → Patna)
2. `ANVT → PPTA` (Anand Vihar → Patliputra)
3. `CSMT → PNBE` or `LTT → GKP` (Mumbai → Patna / Gorakhpur)
4. `HWH → PURI` (Howrah → Puri)
5. `SBC → MAS` (Bengaluru → Chennai)
6. `NDLS → MMCT` (Delhi → Mumbai)

### Step 2: Verification Criteria (Strict Guardrails)
Before generating any post, all conditions must be verified:
- **Baseline Check (ConfirmTkt / IRCTC):** Direct booking for the target class (e.g. 3A, SL, 2A) must explicitly be `WL` (Waitlisted) or `REGRET`.
- **LastBerth Search:** Must find confirmed split legs on the **exact same train**.
- **Contiguity:** All legs must be contiguous (Station A $\rightarrow$ B $\rightarrow$ C $\rightarrow$ D).
- **Confirmed Berths:** Every split leg must have positive available seats (`AVL > 0` or `CURR_AVBL`).
- **Fare Arithmetic:** Total fare must equal the sum of the individual split leg fares.
- *If no train satisfies all conditions on the target corridor, advance to the next corridor or stop. Never fabricate data.*

### Step 3: Graphic Rendering & Template Specs
The comparison graphic uses the established template in [`designs/split-ticket-comparison-2026/01-comparison.svg`](file:///Users/kartikarora/Documents/personal/traintickets/designs/split-ticket-comparison-2026/01-comparison.svg):
- **Canvas Dimensions:** `1080 × 1350 px` (4:5 vertical portrait aspect ratio for optimal mobile feed real estate).
- **Top Accent & Brand:** Deep Slate Navy (`#101B2C`) background with Royal Blue (`#355AED`) 10px accent bar at top, `LastBerth` logo (36px, `#FFFFFF`), and `REAL SEARCH. REAL SCREENSHOTS.` (22px, `#B2C0D0`).
- **Kicker:** `SAME TRAIN. A DIFFERENT WAY TO BOOK.` (22px, `#FFBA55`).
- **Headline Contract (Stacked to prevent horizontal clipping):**
  - Line 1: `CONFIRMED TICKET` (DIN Condensed, 92px bold, Mint `#88E2B6`)
  - Line 2: `{ORIGIN} → {DESTINATION}` (DIN Condensed, 58px bold, White `#FFFFFF`)
  - Line 3: `TRAVEL DATE: {TRAVEL DATE}` (DIN Condensed, 44px bold, Amber `#FFBA55`)
  - Sub-headline: `{TRAIN NAME} · {TRAIN NUMBER} · DEPARTS {DEPARTURE TIME}` (Arial, 28px bold, Slate `#E4EAF2`)
- **Left Card (Competitor / IRCTC Direct Booking):**
  - Muted warm surface (`#FFF4EF`, 310×566px) with red accent strip (`#BC5849`).
  - Real status excerpt showing direct `WL [Number]` or `REGRET` with status badge `WAITLISTED` (`#8E3F32` on `#F6DDD4`).
- **Right Card (LastBerth Split Legs):**
  - Fresh mint surface (`#F1FCF6`, 620×566px) with green accent strip (`#247251`).
  - Ordered contiguous split legs: station codes, travel class, available count (`AVL X`), and individual leg fare (`₹XXX`).
- **Bottom Footer:**
  - White card (`#FFFFFF`, 952×105px) with `TOTAL FARE ₹[TOTAL FARE]` in bold navy (`#101B2C`).
  - Action button: **`Book on LastBerth.com →`** (447×69px, `#355AED` with bold white 28px text).
  - Summary row: `{N} tickets · {Classes breakdown} · Class / berth change needed` (25px, `#D6E0EB`).
  - Disclaimers: `Availability and fares shown in screenshots. Recheck before booking.` and `Screenshot excerpts enlarged for readability.`
- **Rendering Command:**
  Execute the Playwright renderer from the workspace root:
  ```bash
  node designs/split-ticket-comparison-2026/render.cjs
  ```
  The renderer automatically verifies font readiness, loads crop excerpts, and checks that no `<text>` bounding boxes overflow the canvas (`0 <= left < right <= 1080` and `0 <= top < bottom <= 1350`).

### Step 4: Caption Formatting
Adhere strictly to the direct, no-fluff template:
```text
Waitlisted end to end? We found you confirmed seats on [Train Number] [Train Name] from [Origin] to [Destination] for ₹[Total Fare]. 🚆

• ConfirmTkt / IRCTC: [Class] is WAITLISTED ([WL Status]) for the full route.
• LastBerth: Confirmed seats found across [N] split legs on the SAME train:
  01 [ORIGIN] → [TRANSIT 1]: [Class] (AVL [Count]) — ₹[Fare]
  02 [TRANSIT 1] → [TRANSIT 2]: [Class] (AVL [Count]) — ₹[Fare]
  03 [TRANSIT 2] → [DEST]: [Class] (AVL [Count]) — ₹[Fare]

Total fare: ₹[Total Fare] ([Classes Breakdown]).
Separate tickets on the same train · Class/berth change needed.

Availability is live at search time. Recheck before booking.

Search confirmed split seats for your route at lastberth.com (link in bio).

#LastBerth #IndianRailways #TrainTickets #Waitlisted #ConfirmTkt #IRCTC #SplitTickets #TrainTravel
```

### Step 5: Publishing via Browser Automation
1. **Format Conversion:** Convert the generated PNG to standard baseline JPEG (`.jpg`, sRGB, quality 95, 1080×1350) and copy to `os.tmpdir()` (`/var/folders/dw/.../T/banner.jpg`). Instagram Web rejects PNG uploads with `"Media type invalid"`.
2. **Navigate & Upload:** Navigate to `https://www.instagram.com/lastberth.in/`, click "New post", and upload the JPEG via `upload_file`.
3. **Aspect Ratio:** On the Crop dialog, click the "Select Crop" button and choose "Original" to preserve the full 4:5 vertical framing without automatic 1:1 square cropping.
4. **Caption Injection:** Advance through Filters to the Caption editor (`div[aria-label="Add a caption..."]`). Clear any draft text, type the standardized caption, and confirm character counter updates.
5. **Publish & Verify:** Click "Share", wait for publication confirmation modal, and record the live permalink (`https://www.instagram.com/p/...`).
