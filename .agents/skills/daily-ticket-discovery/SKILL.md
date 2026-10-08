---
name: daily-ticket-discovery
description: Scans target corridors, verifies direct Waitlist/Regret on ConfirmTkt vs confirmed split legs on LastBerth, generates daily screenshot comparison graphics, and publishes verified proof posts to @lastberth.in.
---

# Daily Ticket Discovery & Screenshot Proof Skill

You are equipped with the capability to run the daily LastBerth vs. ConfirmTkt / IRCTC ticket discovery audit and publish verified screenshot comparisons to [`@lastberth.in`](https://www.instagram.com/lastberth.in/).

## Strategy & Guidelines

Refer to the master strategy document at [docs/INSTAGRAM_CONTENT_STRATEGY.md](file:///Users/kartikarora/Documents/personal/traintickets/docs/INSTAGRAM_CONTENT_STRATEGY.md) and design specifications at [design.md](file:///Users/kartikarora/Documents/personal/traintickets/design.md).

### Core Principle
**"SAME TRAIN. A DIFFERENT WAY TO BOOK. END-TO-END: WAITLISTED. LASTBERTH FOUND A WAY."**  
Tell users directly: *"We found you tickets in this train from A-B for this price and that's it compared to WL/Regret on IRCTC."*

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
Before generating any post, both conditions must be verified:
- **Baseline Check (ConfirmTkt / IRCTC):** Direct booking for the target class (e.g. 3A, SL, 2A) must explicitly be `WL` (Waitlisted) or `REGRET`.
- **LastBerth Search:** Must find confirmed split legs on the **exact same train**.
- **Contiguity:** All legs must be contiguous (Station A $\rightarrow$ B $\rightarrow$ C $\rightarrow$ D).
- **Confirmed Berths:** Every split leg must have positive available seats (`AVL > 0` or `CURR_AVBL`).
- **Fare Arithmetic:** Total fare must equal the sum of the individual split leg fares.
- *If no train satisfies all conditions on the target corridor, advance to the next corridor or stop. Never fabricate data.*

### Step 3: Graphic Rendering
Generate the `1080 × 1350 px` comparison graphic matching the design in `/designs/split-ticket-comparison-2026/01-comparison.svg`:
- **Headline Contract:**
  - **Headline:** `Confirmed Ticket from {origin} to {destination} for {Travel Date}` (stacked for clean layout without horizontal overflow, e.g., `CONFIRMED TICKET` / `{ORIGIN} → {DESTINATION}` / `TRAVEL DATE: {DATE}`).
  - **Sub-headline:** `{train name} · {train number} · DEPARTS {time of the train}`.
- **Left Card (Direct Booking):** ConfirmTkt / IRCTC excerpt showing `WL [Number]` or `REGRET` with status pill `WAITLISTED`.
- **Right Card (LastBerth):** Split legs with station pairs, classes, seat counts (`AVL X`), and individual fares.
- **Bottom Footer:** Total fare (`TOTAL FARE ₹XXXX`), leg count & classes breakdown, disclaimer note (`Class / berth change needed`), and action button: **`Book on LastBerth.com →`**.

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
1. Convert the generated image to a standard baseline JPEG (`.jpg`, sRGB, quality 95, 1080×1350) and copy to `os.tmpdir()` (Instagram Web rejects PNG uploads with `"Media type invalid"`).
2. Navigate to `https://www.instagram.com/lastberth.in/`.
3. Click "New post" and upload the JPEG via `upload_file`.
4. On the Crop screen, click the "Select Crop" button and choose "Original" (to preserve the full 4:5 vertical canvas without 1:1 square clipping).
5. Advance through Filter to the Caption screen.
6. Focus the caption editor, clear any existing text, and type the formatted caption.
7. Click "Share", wait for publication confirmation, and record the live post permalink.
