/**
 * Client-safe homepage locale constants and types (no Node fs imports, so this
 * is safe to import from client components). The fs-backed string loader lives
 * in home-i18n.ts.
 */
export const HOME_LANGS = ["en", "hi", "mr", "bn", "ta", "te", "ml"] as const;
export type HomeLang = (typeof HOME_LANGS)[number];

export function isHomeLang(x: string): x is HomeLang {
  return (HOME_LANGS as readonly string[]).includes(x);
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

export type HomeFaq = { q: string; a: string };

export type HomeStrings = {
  hero: {
    titleLead: string;
    titleHighlight: string;
    titleTail: string;
    subtitle: string;
  };
  tabs: { route: string; pnr: string; seat: string };
  form: {
    from: string;
    to: string;
    date: string;
    stationPlaceholder: string;
    acOnly: string;
    search: string;
    searching: string;
  };
  nav: {
    confirmed: string;
    chartVacancy: string;
    pnrStatus: string;
    chartTimes: string;
    foodMenu: string;
    blog: string;
  };
  seo: {
    heading: string;
    subtitle: string;
    faqs: HomeFaq[];
    relatedIntro: string;
    linkChartTimes: string;
    linkChartVacancy: string;
    linkGlossary: string;
    linkPnr: string;
    glossaryLangsNote: string;
  };
  languageLabel: string;
};

/** hreflang map for the homepage: each locale + an -IN variant, plus x-default. */
export function homeHreflang(): Record<string, string> {
  const langs: Record<string, string> = {};
  for (const l of HOME_LANGS) {
    const u = l === "en" ? "/" : `/${l}`;
    langs[l] = u;
    langs[`${l}-IN`] = u;
  }
  langs["x-default"] = "/";
  return langs;
}
