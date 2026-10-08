# LastBerth Instagram Strategy: Daily Ticket Discovery & Screenshot Proof

**Official Account:** [`@lastberth.in`](https://www.instagram.com/lastberth.in/) (`https://www.instagram.com/lastberth.in/`)  
**Core Value Proposition:** *"SAME TRAIN. A DIFFERENT WAY TO BOOK. END-TO-END: WAITLISTED. LASTBERTH FOUND A WAY."*

---

## 1. Executive Summary & Strategic Focus

This strategy completely decouples Instagram social media publishing from the blog posting workflow. 

Rather than repurposing SEO articles or posting generic advice, the **@lastberth.in** Instagram channel is dedicated entirely to **daily proof-of-value screenshot comparisons**:
- We identify real train journeys where the end-to-end direct ticket is **WAITLISTED (WL)** or **REGRET** on IRCTC / ConfirmTkt.
- We show how LastBerth found **confirmed available seats** across split legs on the **exact same train**.
- We tell users straightforwardly: *"We found you confirmed tickets in this train from A → B for this price, compared to WL/Regret on IRCTC."* That's it.

Zero theoretical fluff. Undeniable visual proof of product value that solves travellers' immediate ticket crises.

---

## 2. Visual Format & Slide Architecture

All daily Instagram posts must follow the battle-tested layout exemplified in the master template (`01-comparison.png` / `01-comparison.svg`):

```
+-------------------------------------------------------------------------+
| LastBerth                                  REAL SEARCH. REAL SCREENSHOTS. |
|-------------------------------------------------------------------------|
| SAME TRAIN. A DIFFERENT WAY TO BOOK.                                    |
| CONFIRMED TICKET                                                        |
| {ORIGIN} TO {DESTINATION}                                               |
| TRAVEL DATE: {TRAVEL DATE}                                              |
| {TRAIN NAME} · {TRAIN NUMBER} · DEPARTS {TRAIN TIME}                    |
|                                                                         |
| +-------------------------+ +-----------------------------------------+ |
| | ConfirmTkt              | | LastBerth                               | |
| | End-to-end · 3A         | | Available seats in split legs           | |
| |-------------------------| |-----------------------------------------| |
| | SCREENSHOT EXCERPT      | | 01 ANVT → PRYJ   3A  AVL 17  ₹1035      | |
| | [ 30 Sep  WL 44 ]       | | 02 PRYJ → DDU    3A  AVL 12  ₹565       | |
| |                         | | 03 DDU → PPTA    2A  AVL 1   ₹770       | |
| | [ WAITLISTED ]          | |                                         | |
| | One ticket for full rte | |                                         | |
| +-------------------------+ +-----------------------------------------+ |
|                                                                         |
| 3 tickets · 3A + 3A + 2A · Class / berth change needed                  |
| +------------------------------------+ +------------------------------+ |
| | TOTAL FARE  ₹2370                  | | Book on LastBerth.com →      | |
| +------------------------------------+ +------------------------------+ |
| Availability and fares shown in screenshots. Recheck before booking.    |
+-------------------------------------------------------------------------+
```

### Visual Specifications
- **Canvas Size:** `1080 x 1350 px` (`4:5` portrait aspect ratio) for maximum vertical screen share in mobile feeds. Also supports `1080 x 1080 px` (`1:1` square).
- **Background:** Deep slate navy (`#101B2C`) with brand blue top border accent (`#355AED`).
- **Typography & Headline Contract:**
  - **Content Headline:** `Confirmed Ticket from {origin} to {destination} for {Travel Date}` (bold condensed `DIN Condensed` / `Arial Narrow Bold`, high-impact mint green `#88E2B6` and white `#FFFFFF`).
  - **Train Context Subheader:** `{train name} · {train number} · {time of the train}` (crisp slate `#E4EAF2` and amber `#FFBA55`).
  - **Body & UI Cards:** Clean modern sans-serif (`Arial` / `Helvetica`).
- **Cards Hierarchy:**
  - **Left Card (Competitor / IRCTC Direct Booking):** Muted warm background (`#FFF4EF`), dark text, red accent strip (`#BC5849`), displaying real status pill `WAITLISTED` (`#8E3F32` on `#F6DDD4`) or `REGRET`.
  - **Right Card (LastBerth Split Legs):** Fresh mint background (`#F1FCF6`), dark green text (`#315A43`), green accent strip (`#247251`), displaying ordered contiguous legs with seat count (`AVL X`) and leg fare (`₹XXX`).
- **Footer Bar:** Clean white banner with bold `TOTAL FARE ₹XXXX` and vibrant blue action button **`Book on LastBerth.com →`** (`#355AED`).
- **Disclaimers:** Mandatory legible note at base: *"Availability and fares shown in screenshots. Recheck before booking."* and *"Class / berth change needed"*.

---

## 3. Copywriting & Caption Strategy

The caption must be concise, punchy, and transparent. Do not write essay-length prose. Deliver the core facts immediately.

### Caption Template:
```text
Waitlisted end to end? We found you confirmed seats on [Train Number] [Train Name] from [Origin Station Name] to [Destination Station Name] for ₹[Total Fare]. 🚆

• ConfirmTkt / IRCTC: [Direct Class] is WAITLISTED ([WL Status, e.g. WL 44]) for the full route.
• LastBerth: Confirmed seats found across [N] split legs on the SAME train:
  01 [ORIGIN] → [TRANSIT 1]: [Class] (AVL [Count]) — ₹[Fare]
  02 [TRANSIT 1] → [TRANSIT 2]: [Class] (AVL [Count]) — ₹[Fare]
  03 [TRANSIT 2] → [DEST]: [Class] (AVL [Count]) — ₹[Fare]

Total fare: ₹[Total Fare] ([Classes Breakdown, e.g. 3A + 3A + 2A]).
Separate tickets on the same train · Class/berth change needed.

Availability is live at the time of search. Recheck before booking.

Search confirmed split seats for your route at lastberth.com (link in bio).

#LastBerth #IndianRailways #TrainTickets #Waitlisted #ConfirmTkt #IRCTC #SplitTickets #TrainTravel
```

### Copy Rules:
1. **Hook in line 1:** State the train, route, and total fare right away.
2. **Direct comparison:** Clearly present the contrast between direct waitlist vs LastBerth split seats.
3. **Full transparency:** Always disclose that split ticketing means separate bookings and a seat/coach change during the journey.
4. **Actionable CTA:** Drive users to `lastberth.com` via the link in bio.
5. **Clean tags:** 6–8 relevant, non-spammy hashtags.

---

## 4. Operational Requirements for the Future Automation Skill

This strategy is implemented by a dedicated daily automation skill. The skill executes the following pipeline:

### Step 1: Corridor & Target Selection
Rotate daily across high-traffic, waitlist-heavy trunk corridors with travel dates 1–5 days ahead (India time):
- `NDLS → PNBE` (New Delhi → Patna)
- `ANVT → PPTA` (Anand Vihar → Patliputra)
- `CSMT → PNBE` / `LTT → GKP` (Mumbai → Patna / Gorakhpur)
- `HWH → PURI` (Howrah → Puri)
- `SBC → MAS` (Bengaluru → Chennai)
- `NDLS → MMCT` (Delhi → Mumbai)

### Step 2: Automated Availability Audit & Verification
Before generating any post, verify both ends:
1. **ConfirmTkt / IRCTC Status Check:** Direct origin-to-destination booking for the target class MUST be `WL` (Waitlisted) or `REGRET`.
2. **LastBerth Search:** Run the route on LastBerth.
3. **Eligibility Verification:**
   - Must be on the **exact same train**.
   - Must be **contiguous legs** (Arrival station of Leg $N$ = Departure station of Leg $N+1$).
   - Every split leg must have confirmed availability (`AVL > 0` or `CURR_AVBL`).
   - Sum of leg fares must equal the total fare.
   - If no valid match is found on the target corridor, fail gracefully (no post). Never fabricate data.

### Step 3: Screenshot & Graphic Rendering
1. Capture clean viewport crops or render via the established SVG template (`01-comparison.svg`).
2. Populate dynamic fields:
   - Train number & name
   - Journey date & stations
   - Direct waitlist status & class
   - Split leg station codes, classes, available seats, and individual fares
   - Total fare and leg count
3. Export high-resolution PNG (`1080 x 1350 px`) using Sharp or headless Playwright.

### Step 4: Publication to `@lastberth.in`
1. Use browser automation with dedicated Instagram profile.
2. Upload the exported comparison graphic (`01-comparison.png`).
3. Inject the standardized caption.
4. Verify publication and capture live permalink (`https://www.instagram.com/p/...`).
