# LastBerth Instagram Social Media & Visual Content Strategy

**Official Channel:** [`https://www.instagram.com/lastberth.in/`](https://www.instagram.com/lastberth.in/) (`@lastberth.in`)  
**Core Agenda:** Drive train travellers from social discovery to search and book **last-minute confirmed train tickets** on LastBerth (`/`, `/chart-times`, `/chart-vacancy`, `/seat-status`).

---

## 1. Mission & Creative Vision

Millions of Indian railway passengers face the daily nightmare of **WL (Waiting List)** and **REGRET** on IRCTC, especially during Tatkal hours and peak festival seasons. Most commuters falsely assume that once a train is waitlisted, their only options are cancelling their journey or paying exorbitant tout markups.

The **@lastberth.in Instagram channel** exists to:
1. **Debunk the "Sold Out" Myth:** Educate travellers that hundreds of confirmed berths are legally released during **Reservation Chart Preparation** (~8 hours and 30 minutes before departure).
2. **Promote LastBerth Tools:** Channel users to `lastberth.com` for **Smart Seats** (contiguous split-tickets on the same train), **Chart Times** (`/chart-times`), and **Chart Vacancy** (`/chart-vacancy`).
3. **Build High-Trust Visual Authority:** Deliver eye-catching, data-dense infographics, carousel breakdowns, and video/story cards that train travellers want to save and share.

---

## 2. Core Educational Themes & Content Pillars

Every Instagram post generated must weave in one or more of these four foundational themes:

### Pillar 1: Chart Preparation Times & Cutoffs
- **First Charting Window:** Prepared **8 to 10 hours** prior to train departure from the originating station. For morning trains departing before 14:00 hrs, Chart 1 is finalized by **20:00 hrs (8:00 PM) the previous evening**.
- **Second / Final Charting Window:** Prepared **30 to 45 minutes** prior to train departure, factoring in last-minute cancellations and quota releases.
- **The Golden Window:** The period between Chart 1 and Chart 2 where unallocated berths are available for online booking without Tatkal surcharges.

### Pillar 2: How Tickets Are Released on Chart Prep (Current Availability)
- **Quota Conversion Mechanics:** Unused VIP/HO quotas, pooled quotas (PQWL), remote location quotas (RLWL), ladies quotas (LD), and emergency quotas are automatically released into the general pool at chart prep.
- **What is `CURR_AVBL` (Current Availability)?**
  - A `CURR_AVBL` ticket is **100% confirmed** with assigned coach and berth numbers.
  - Sold at a **10% discount** on the basic fare.
  - Can be booked on IRCTC or station counters up to **30 minutes before departure**.

### Pillar 3: Popular Train Chart Times & Real Vacancy Benchmarks
Showcase actual historical charting times and typical berth release patterns on India's busiest trunk corridors:
- **Mumbai ➔ New Delhi (Tejas Express / Mumbai Rajdhani):** 1st Chart finalized at ~20:00 hrs previous evening. Regularly opens 25–40 confirmed 3AC and 2AC berths under Current Availability.
- **New Delhi ➔ Patna (Sampoorna Kranti Express / Patna Rajdhani):** 1st Chart finalized 8 hours prior (~09:30 AM). 30+ Sleeper and 3E berths open up post-charting.
- **Bengaluru ➔ Chennai (Vande Bharat / Shatabdi Express):** 1st Chart finalized 8 hours prior. Executive Chair Car (EC) and Chair Car (CC) frequently release 15–20 vacant seats.
- **Mumbai ➔ Varanasi / Gorakhpur (Pushpak / Mahanagari Express):** 1st Chart finalized 8–10 hours prior. Vacant berths released across Sleeper and AC Economy coaches.

### Pillar 4: Smart Seats (Contiguous Split-Journey Discovery)
- Explain how passengers can book confirmed contiguous legs on the same train (e.g. Coach B2 for Leg 1, Coach B5 for Leg 2) without deboarding when direct origin-to-destination tickets show REGRET.

---

## 3. Visual Asset Guidelines (Mandatory `design.md` Compliance)

All visual assets and social banners generated for Instagram must strictly follow the visual design system defined in [`design.md`](file:///Users/kartikarora/Documents/personal/traintickets/design.md).

### Format & Specs:
- **Design System Reference:** Follow [`design.md`](file:///Users/kartikarora/Documents/personal/traintickets/design.md) for palette, typography, visual hierarchy, and composition.
- **Aspect Ratio:** Single Image: `1:1` Square (`1080x1080px`) or `4:5` Portrait (`1080x1350px`).
- **Carousel Sets:** 4 to 6 slides breaking down complex rules into swipeable cards.
- **Color Palette (from `design.md`):**
  - Background: Deep midnight navy (`#0B1120`, `#0F172A`) or sleek graphite.
  - Accents: Vibrant emerald green (`#10B981` — representing confirmed status), warm amber (`#F59E0B` — urgency/alerts), and clean white (`#FFFFFF`) for typography.
- **Visual Elements:**
  - Modern Indian train silhouettes (Vande Bharat, Tejas, LHB rakes).
  - Clean UI card mockups displaying countdown clocks ("Chart Prep: 8h before departure").
  - Prominent LastBerth branding badge (`lastberth.com • Find Smart Seats & Chart Times`).

---

## 4. Caption & Copywriting Blueprint

1. **Stop-the-Scroll Hook (First 125 Characters before the "more" fold):**  
   *Example: "Thought this train was sold out? Here is how 40+ confirmed berths appear 30 mins before departure 🚆"*
2. **The Commuter Problem:** Relatable frustration (*"WL/52 and Tatkal quotas disappeared in 60 seconds?"*).
3. **The Railway Insider Secret:** Step-by-step breakdown of chart preparation and `CURR_AVBL` release.
4. **Popular Train Callout:** Real charting time examples (e.g. Tejas / Rajdhani / Vande Bharat).
5. **Clear Call to Action (CTA):**  
   *"Stop stressing over waitlists. Head to the link in our bio (@lastberth.in) to scan confirmed split seats and chart preparation times on LastBerth.com."*
6. **Engagement Prompt:**  
   *"Drop your train number or travel route in the comments, and we'll reply with its exact chart prep time! 👇"*
7. **Sized Hashtags (3–5 tags via `ig-hashtag-strategist`):**  
   Never post a 30-tag wall. Assemble a 3–5 sized tag set (2–3 niche, 1–2 mid, 0–1 broad) placed at the very end of the caption:  
   `#CurrentAvailability #ChartPreparation #LastBerth #TrainTravelIndia #IRCTC`

---

## 5. Integration with `.agents/instagram-skills/` Toolchain

When executing the Instagram social media automation for LastBerth, the agent must trigger the dedicated skills in `.agents/instagram-skills/`:

| Skill | Path | Role in Instagram Workflow |
|---|---|---|
| **`ig-repurposer`** | `.agents/instagram-skills/skills/ig-repurposer/SKILL.md` | Ingests the daily blog post (`content/blog/<slug>.md`), extracts the educational spine (chart prep, `CURR_AVBL`, popular trains), strips off-platform artifacts ("link in bio" from other platforms, long prose), and re-hooks before the 125-char fold. |
| **`ig-carousel-planner`** | `.agents/instagram-skills/skills/ig-carousel-planner/SKILL.md` | Structures a 5-slide educational carousel (1:1 or 4:5 portrait) with one point per slide: <br>• **Slide 1 (Hook):** Relatable waitlist frustration + the promise of last-minute confirmed seats. <br>• **Slide 2 (The Secret):** Chart Preparation Windows (~8–10h first chart, 30m final chart). <br>• **Slide 3 (The Mechanics):** How unallocated quotas convert into `CURR_AVBL` at a 10% discount. <br>• **Slide 4 (Real Examples):** Popular train chart times (Mumbai–Delhi, Delhi–Patna, Bengaluru–Chennai). <br>• **Slide 5 (Payoff & CTA):** Summary table + CTA to search Smart Seats and live vacancies on `lastberth.com`. |
| **`ig-caption-writer`** | `.agents/instagram-skills/skills/ig-caption-writer/SKILL.md` | Formulates the accompanying high-converting Instagram caption with the punchy first-125-char hook. |
| **`ig-hashtag-strategist`** | `.agents/instagram-skills/skills/ig-hashtag-strategist/SKILL.md` | Selects a clean, rankable 3–5 hashtag set (niche/mid/broad mix) placed at the end. |
| **`ig-humanizer`** | `.agents/instagram-skills/skills/ig-humanizer/SKILL.md` | Audits the caption and slide text: eliminates AI buzzwords, ensures punchy natural sentence rhythm, enforces the em-dash cap (1–2 per caption max), and checks the 125-char fold. |

---

## 6. Automated Pipeline Execution Order

1. **Repurpose Blog Content:**  
   Trigger `ig-repurposer` (or run `npx tsx scripts/generate_instagram_post.ts <slug>`) to distill the post into an Instagram caption and carousel structure.
2. **Carousel & Caption Audit:**  
   Apply `ig-carousel-planner` to review slide layouts, `ig-hashtag-strategist` for 3–5 sized tags, and `ig-humanizer` to eliminate AI tells.
3. **Visual Banner Generation (`design.md` Compliance):**  
   Use `generate_image` with the prompt template from [`design.md`](file:///Users/kartikarora/Documents/personal/traintickets/design.md). Ensure:
   - Deep midnight navy (`#0B1120`) background.
   - Vibrant emerald green (`#10B981`) and amber (`#F59E0B`) accents.
   - High-contrast typography displaying the chart preparation window and `CURR_AVBL` release.
   - Clean UI card mockups and modern train silhouettes.
4. **Publishing / Staging via Browser Automation (`chrome-devtools-mcp`):**  
   Follow the proven browser direct-posting workflow to publish directly to [`https://www.instagram.com/lastberth.in/`](https://www.instagram.com/lastberth.in/):
   1. **Copy Media to `os.tmpdir()`:** `chrome-devtools-mcp` restricts `upload_file` to workspace roots or `os.tmpdir()`. Copy the generated image from `generate_image` into `require('os').tmpdir()` (e.g. `/private/var/folders/.../T/banner.jpg`).
   2. **Open Instagram in Browser:** Select the Instagram page via `select_page` or navigate to `https://www.instagram.com/lastberth.in/`.
   3. **Open New Post Modal:** Click the "New post" navigation button (`a[href="#"]` with "New post").
   4. **Upload Image via `upload_file`:** Call `upload_file` with the `pageId`, the `uid` of the "Select From Computer" button, and `filePaths: ["<path_in_tmpdir>"]`. Instagram automatically accepts the file and advances to the "Crop" screen (`/create/style/`).
   5. **Advance Crop & Filter Screens:**
      - On "Crop" dialog: click `button "Next"`.
      - On "Edit" (Filters) dialog: click `button "Next"`.
   6. **Inject Caption & Format:** Focus the caption editor (`div[aria-label="Add a caption..."]`). Insert the generated caption (≤2,200 chars) using `document.execCommand('insertText', false, caption)` or a clipboard paste event via `evaluate_script`.
   7. **Share Post:** Click `button "Share"`. Wait for the modal to display "Post shared" with the animated checkmark ("Your post has been shared."). Click `button "Done"` to dismiss.
   8. **Verify & Capture Live URL:** Refresh the profile page (`https://www.instagram.com/lastberth.in/`), click the latest post thumbnail in the grid, and record the live URL (e.g. `https://www.instagram.com/p/<shortcode>/`).

