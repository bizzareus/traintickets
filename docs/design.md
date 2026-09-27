# LastBerth Social Media Banner & Visual Design System (`design.md`)

This document defines the strict visual design language, layout standards, color palettes, typography, and composition rules for all social media banners, Instagram graphics (`@lastberth.in`), and visual assets generated for LastBerth.

---

## 1. Core Visual Identity & Tone

- **Aesthetic:** Premium, authoritative, data-dense yet minimalist editorial design. Clean fintech/travel-tech feel (similar to Stripe/Linear applied to modern railway transportation).
- **Core Emotional Hook:** Relief from railway booking anxiety. High confidence, clarity, and instant problem solving.
- **Rule of Thumb:** Every banner must instantly communicate a concrete solution to the railway waitlist/REGRET problem within 1.5 seconds of scrolling.

---

## 2. Canvas Dimensions & Aspect Ratios

- **Instagram Feed (Square):** `1080 x 1080 px` (`1:1` aspect ratio) — standard feed posts.
- **Instagram Feed (Portrait):** `1080 x 1350 px` (`4:5` aspect ratio) — maximum vertical real estate on mobile feeds (preferred for carousels and infographics).
- **Instagram Stories & Reels:** `1080 x 1920 px` (`9:16` aspect ratio).
- **LinkedIn / Web Hero Banners:** `1200 x 628 px` (`1.91:1` aspect ratio).

---

## 3. Brand Color Palette & Status Semantics

All banner designs must adhere strictly to this restrained, high-contrast palette:

| Role | Color Name | Hex Code | Purpose & Usage |
|---|---|---|---|
| **Canvas Background** | Midnight Navy | `#0B1120` / `#0F172A` | Deep dark slate/navy backdrop. Creates high depth and premium contrast. |
| **Surface Cards** | Dark Glass / Card Slate | `#1E293B` (with `border-white/10`) | Subtle card elevation for data blocks, timing pills, and callout boxes. |
| **Primary Accent** | Emerald Green | `#10B981` / `#059669` | Represents **Confirmed**, **Available**, **100% Guaranteed**, and positive status. |
| **Urgency Accent** | Warm Amber / Gold | `#F59E0B` / `#D97706` | Represents **Chart Countdown**, **Alerts**, **Limited Time**, and critical cutoffs. |
| **Headline Typography** | Pure White | `#FFFFFF` | Maximum legibility for main hooks, numbers, and core question headlines. |
| **Body & Metadata** | Slate Gray | `#94A3B8` / `#CBD5E1` | Secondary descriptions, timestamps, station codes, and supporting text. |
| **Destructive / Alert** | Coral Red | `#EF4444` | Used sparingly for `REGRET` / `WL` problem demonstrations. |

> **Contrast Rule:** Never place low-contrast text on dark backgrounds. All text must pass WCAG AAA standards for legibility.

---

## 4. Typography & Visual Hierarchy

1. **Eyebrow / Category Tag (Top):**
   - Size: Small (`12–14px` equivalent), Semibold, Uppercase.
   - Styling: Enclosed in a pill badge (`bg-white/10` with `#10B981` or `#F59E0B` text).
   - Examples: `⚡ IRCTC CHARTING INSIDER`, `🚆 LAST-MINUTE CONFIRMED SEATS`.
2. **Main Headline / Hook (Upper Center):**
   - Size: Bold/Extrabold (`32–48px` equivalent), tight letter tracking (`-0.02em`).
   - Copy: Punchy, question- or outcome-led.
   - Example: *"CONFIRMED SEATS 30 MINS BEFORE DEPARTURE"*, *"HOW TO BYPASS REGRET ON FESTIVAL SPECIALS"*.
3. **Focal UI Data Cards (Center):**
   - 2 to 3 structured cards displaying real numbers and operational facts:
     - Card 1: **1st Chart:** `~8 Hours Prior` (or `8:00 PM previous evening`).
     - Card 2: **2nd Chart:** `30 Mins Before Departure`.
     - Card 3: **Current Availability (`CURR_AVBL`):** `100% Confirmed Berths at 10% Off`.
4. **Train Iconography & Silhouettes (Lower Third):**
   - Sleek, modern vector silhouettes of high-speed Indian trainsets (Vande Bharat Express, Tejas Express, or modern aerodynamic LHB coaches).
   - Subtle glowing track lines or speed accents beneath the train to convey motion and technology.
5. **Footer & LastBerth Brand Attribution (Bottom):**
   - Prominent, clean branding centered at the bottom:  
     `lastberth.com • Find Smart Seats & Chart Times`
   - Verified badge or minimal lock/shield icon indicating authoritative data.

---

## 5. Composition & Layout Rules

- **Safe Zones:** Keep all critical text, data cards, and logos within a 10% inner margin (at least 80px from all canvas edges) to prevent cutoff across different device viewports.
- **Negative Space:** Do not overcrowd the graphic. Allow breathing room between the headline, the data cards, and the bottom train illustration.
- **No Clutter:** Avoid stock photo collages, cartoonish emojis, or crowded passenger photos. Prefer crisp vector UI cards, clean numbers, and refined train silhouettes.
- **Single Focal Point:** Every slide or banner must have one clear hero takeaway (e.g. the 30-minute charting window or the split-ticket mechanism).

---

## 6. Prompt Engineering Template for AI Image Generation

When generating banner graphics via `generate_image` or external generative pipelines, adhere to this prompt structure:

```text
Clean, modern editorial infographic social media banner for Instagram (aspect ratio 1:1, 1080x1080px) following LastBerth design.md specifications.
Background: Deep midnight navy (#0B1120) and dark slate (#0F172A) with subtle glassmorphic elevation cards (border-white/10).
Typography: Bold, high-contrast white (#FFFFFF) headline: "<MAIN_HEADLINE_TEXT>".
Accent colors: Vibrant emerald green (#10B981) for confirmed status and warm amber (#F59E0B) for countdown indicators.
Visual elements: 
- Sleek modern Vande Bharat / Tejas aerodynamic train vector moving across glowing digital railway tracks.
- Two high-contrast UI pill cards: "1st Chart: ~8 Hours Prior" and "Final Chart: 30 Mins Before".
- Highlight badge: "Current Availability (CURR_AVBL) = 100% Confirmed Tickets Released".
Footer: Clean typography reading "lastberth.com • Find Smart Seats & Chart Times".
Style: Vector graphic, ultra-crisp, premium fintech/travel-tech aesthetic, zero visual clutter, sharp vector edges.
```
