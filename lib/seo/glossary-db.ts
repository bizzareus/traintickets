import fs from "node:fs";
import path from "node:path";

export type GlossaryTerm = {
  id: string;
  term: string;
  definition: string;
  relatedTerms?: string[];
};

/** Languages the glossary is offered in (English source + translations). */
export const GLOSSARY_LANGS = ["en", "hi", "mr", "bn", "ta", "te", "ml"] as const;
export type GlossaryLang = (typeof GLOSSARY_LANGS)[number];

export function isGlossaryLang(x: string): x is GlossaryLang {
  return (GLOSSARY_LANGS as readonly string[]).includes(x);
}

export function getLanguageName(lang: string): string {
  switch (lang) {
    case "hi": return "Hindi";
    case "mr": return "Marathi";
    case "bn": return "Bengali";
    case "ta": return "Tamil";
    case "te": return "Telugu";
    case "ml": return "Malayalam";
    default: return "English";
  }
}

/**
 * English glossary, the source of truth. Definitions are written plainly, the
 * way a regular traveller would explain them to a friend (no jargon dumps, no
 * em dashes). Translations live in content/glossary/<lang>.json (see
 * scripts/translate-glossary.ts) and fall back to this English text.
 */
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "wl",
    term: "WL (Waiting List)",
    definition:
      "WL stands for Waiting List, which is the full form of WL in railway bookings. A WL status means your ticket is placed in a queue but does not have a confirmed berth yet. Fully waitlisted e-tickets are automatically cancelled and refunded after chart preparation, meaning you cannot board the train on a WL status.",
    relatedTerms: ["rac", "cnf", "gnwl"],
  },
  {
    id: "rac",
    term: "RAC (Reservation Against Cancellation)",
    definition:
      "You're allowed to board, but two RAC passengers share one side-lower berth, so you get a sitting spot rather than a full berth to sleep on. As confirmed passengers cancel, RAC moves up to a full berth.",
    relatedTerms: ["wl", "cnf"],
  },
  {
    id: "cnf",
    term: "CNF (Confirmed)",
    definition:
      "Your seat or berth is locked in. The exact coach and berth number are printed when the chart is prepared a few hours before departure, so a confirmed ticket may show 'CNF' first and the coach or berth only later.",
    relatedTerms: ["rac", "wl", "chart-preparation"],
  },
  {
    id: "gnwl",
    term: "GNWL (General Waiting List)",
    definition:
      "The waiting list you get when boarding at or near the train's starting station. It clears the fastest of all the waiting lists because most of the train's berths are set aside for this quota.",
    relatedTerms: ["rlwl", "pqwl", "wl"],
  },
  {
    id: "rlwl",
    term: "RLWL (Remote Location Waiting List)",
    definition:
      "A waiting list for busy intermediate stations along the route. It only moves when someone travelling from that same stretch cancels, so it confirms less often than GNWL even on a low number.",
    relatedTerms: ["gnwl", "pqwl", "wl"],
  },
  {
    id: "pqwl",
    term: "PQWL (Pooled Quota Waiting List)",
    definition:
      "One small shared pool of berths covers several short-distance stations on the route. Because so many stations draw from the same pool, PQWL is the hardest waiting list to clear.",
    relatedTerms: ["gnwl", "rlwl", "wl"],
  },
  {
    id: "pnr",
    term: "PNR (Passenger Name Record)",
    definition:
      "The 10-digit number on the top of your ticket. It ties together the train, date, class, your stations and every passenger's status, so checking it tells you exactly where your booking stands.",
    relatedTerms: ["cnf", "wl"],
  },
  {
    id: "chart-preparation",
    term: "Chart Preparation",
    definition:
      "The point where Railways finalises who sits where. The first chart is usually made about four to eight hours before the train leaves its origin, with a second chart closer to departure. Waiting-list e-tickets that haven't confirmed by then are cancelled and refunded.",
    relatedTerms: ["current-availability", "cnf"],
  },
  {
    id: "current-availability",
    term: "Current Availability",
    definition:
      "Current Availability is the real-time count of vacant seats that open for booking after the reservation chart is prepared. These tickets are 100% confirmed with assigned coach and berth numbers. The booking window opens 4 hours before departure (or the night before for morning trains) and closes 30 minutes before departure.",
    relatedTerms: ["chart-preparation", "tatkal"],
  },
  {
    id: "tatkal",
    term: "Tatkal Quota",
    definition:
      "A quota for last-minute travel that opens the day before the train starts from its origin. You pay extra over the base fare, and AC classes open at 10 AM while sleeper opens at 11 AM.",
    relatedTerms: ["premium-tatkal", "current-availability"],
  },
  {
    id: "premium-tatkal",
    term: "Premium Tatkal",
    definition:
      "A dynamic-priced version of Tatkal where the fare climbs as seats sell. There's no waiting list and no refund on cancellation, so it suits travellers who need a confirmed seat and are fine paying a moving price.",
    relatedTerms: ["tatkal", "dynamic-fare"],
  },
  {
    id: "dynamic-fare",
    term: "Dynamic Fare (Flexi Fare)",
    definition:
      "On some premium trains like Rajdhani, Shatabdi and Duronto, the fare rises in steps as more seats are booked. The earlier you book, the cheaper it tends to be.",
    relatedTerms: ["premium-tatkal"],
  },
  {
    id: "tdr",
    term: "TDR (Ticket Deposit Receipt)",
    definition:
      "How you claim a refund in special cases, such as the train being cancelled, running more than three hours late, or the AC failing. You file it online and the refund is reviewed by Railways rather than paid instantly.",
  },
  {
    id: "vikalp",
    term: "Vikalp (Alternate Train Accommodation)",
    definition:
      "An opt-in scheme where a waitlisted passenger agrees to be moved to a confirmed berth on another train on the same route if their original ticket doesn't clear. Choosing it doesn't hurt your chances on the original train.",
    relatedTerms: ["wl"],
  },
  {
    id: "quota-general",
    term: "General Quota (GN)",
    definition:
      "The main pool of seats open to everyone, with no special eligibility. Most bookings draw from here, and it's the default unless you pick Tatkal, Ladies, Senior Citizen or another quota.",
    relatedTerms: ["tatkal", "ladies-quota"],
  },
  {
    id: "ladies-quota",
    term: "Ladies Quota",
    definition:
      "A handful of berths reserved for women travelling alone or with children under twelve. It's separate from the general lower-berth preference that older and women passengers also get.",
    relatedTerms: ["senior-citizen-quota", "quota-general"],
  },
  {
    id: "senior-citizen-quota",
    term: "Senior Citizen Quota",
    definition:
      "Lower berths set aside for men aged sixty and above and women aged forty-five and above. If the quota is full the system still tries to give eligible passengers a lower berth when berths free up.",
    relatedTerms: ["ladies-quota", "quota-general"],
  },
  {
    id: "berth-types",
    term: "Berth Types (LB, MB, UB, SL, SU)",
    definition:
      "How berths are labelled inside a coach. LB, MB and UB are the lower, middle and upper berths in the main bay; SL and SU are the side lower and side upper along the aisle. Side-upper is the cramped one to avoid on long overnight trips.",
    relatedTerms: ["class-sl", "class-3a"],
  },
  {
    id: "class-sl",
    term: "Sleeper Class (SL)",
    definition:
      "The non-AC sleeper class, with open bays of six berths plus two side berths and barred windows. It's the cheapest way to lie down on an overnight train and the most widely available.",
    relatedTerms: ["class-3a", "berth-types"],
  },
  {
    id: "class-3a",
    term: "AC 3-Tier (3A)",
    definition:
      "An air-conditioned coach with three berths stacked on each side, bedding provided, and a coach code like B1 or B2. It's the most popular AC class for overnight journeys.",
    relatedTerms: ["class-2a", "class-sl"],
  },
  {
    id: "class-2a",
    term: "AC 2-Tier (2A)",
    definition:
      "An air-conditioned coach with two berths per side and curtains for privacy, coded A1, A2 and so on. Roomier than 3A and priced above it.",
    relatedTerms: ["class-3a", "class-1a"],
  },
  {
    id: "class-1a",
    term: "AC First Class (1A)",
    definition:
      "The top class, with lockable two- and four-berth cabins and no berth numbers shown until charting. It's the most expensive and the least common, found mainly on premium routes.",
    relatedTerms: ["class-2a"],
  },
  {
    id: "e-ticket",
    term: "E-Ticket",
    definition:
      "A ticket booked online and shown on your phone, with no paper needed. A waitlisted e-ticket is cancelled automatically if it doesn't confirm by charting, unlike a counter ticket.",
    relatedTerms: ["pnr", "wl"],
  },
];

/* ------------------------------------------------------------------ */
/* English helpers (back-compat)                                       */
/* ------------------------------------------------------------------ */

export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.id === id);
}

export function getAllGlossaryTerms(): GlossaryTerm[] {
  return [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));
}

/* ------------------------------------------------------------------ */
/* Translations (content/glossary/<lang>.json)                         */
/* ------------------------------------------------------------------ */

type TermTranslation = { term?: string; definition?: string };
type LangFile = Record<string, TermTranslation>;

const GLOSSARY_CONTENT_DIR = path.join(process.cwd(), "content", "glossary");
const langCache = new Map<string, LangFile | null>();

function loadLangFile(lang: string): LangFile | null {
  if (langCache.has(lang)) return langCache.get(lang) ?? null;
  let data: LangFile | null = null;
  try {
    const fp = path.join(GLOSSARY_CONTENT_DIR, `${lang}.json`);
    if (fs.existsSync(fp)) {
      data = JSON.parse(fs.readFileSync(fp, "utf8")) as LangFile;
    }
  } catch {
    data = null;
  }
  langCache.set(lang, data);
  return data;
}

/** A term in the requested language, falling back to English per field. */
function localizeTerm(base: GlossaryTerm, lang: string): GlossaryTerm {
  if (lang === "en") return base;
  const tr = loadLangFile(lang)?.[base.id];
  if (!tr) return base;
  return {
    ...base,
    term: tr.term?.trim() || base.term,
    definition: tr.definition?.trim() || base.definition,
  };
}

export function getGlossaryTermForLang(
  id: string,
  lang: string,
): GlossaryTerm | undefined {
  const base = getGlossaryTerm(id);
  return base ? localizeTerm(base, lang) : undefined;
}

export function getAllGlossaryTermsForLang(lang: string): GlossaryTerm[] {
  return GLOSSARY_TERMS.map((t) => localizeTerm(t, lang)).sort((a, b) =>
    a.term.localeCompare(b.term),
  );
}

/** Languages with a translation file present (English always included). */
export function listAvailableGlossaryLangs(): GlossaryLang[] {
  return GLOSSARY_LANGS.filter((l) => l === "en" || loadLangFile(l));
}
