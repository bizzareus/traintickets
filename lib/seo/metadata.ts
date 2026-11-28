import type { Metadata } from "next";

export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "LastBerth – Find Confirmed Train Tickets",
} as const;

export const DEFAULT_TWITTER_IMAGE = "/twitter-image";

const OG_LOCALE_BY_LANG: Record<string, string> = {
  en: "en_IN",
  hi: "hi_IN",
  mr: "mr_IN",
  bn: "bn_IN",
  ta: "ta_IN",
  te: "te_IN",
  ml: "ml_IN",
};

/** Resolve an OpenGraph locale code (e.g. "hi_IN") from a route language code. */
export function getOgLocale(lang?: string): string {
  return (lang && OG_LOCALE_BY_LANG[lang]) || "en_IN";
}

/** Build consistent OpenGraph metadata so subpages keep their own url and og:image. */
export function buildOpenGraph({
  title,
  description,
  url,
  type = "website",
  lang,
}: {
  title: string;
  description: string;
  url: string;
  type?: "website" | "article";
  lang?: string;
}): NonNullable<Metadata["openGraph"]> {
  return {
    type,
    locale: getOgLocale(lang),
    siteName: "LastBerth",
    title,
    description,
    url,
    images: [{ ...DEFAULT_OG_IMAGE }],
  };
}

/** Build consistent Twitter summary_large_image metadata. */
export function buildTwitterCard({
  title,
  description,
}: {
  title: string;
  description: string;
}): NonNullable<Metadata["twitter"]> {
  return {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_TWITTER_IMAGE],
  };
}

function truncateAtWord(
  text: string,
  max: number,
  minBoundary: number,
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${(lastSpace > minBoundary ? sliced.slice(0, lastSpace) : sliced).trimEnd()}…`;
}

/** Cap a page title prefix at a clean word boundary so "%s | LastBerth" stays <= 60 chars. */
export function truncateTitle(text: string, max = 48): string {
  return truncateAtWord(text, max, 20);
}

/** Cap a meta description at a clean word boundary within SEO display limits. */
export function truncateMetaDescription(text: string, max = 158): string {
  return truncateAtWord(text, max, 80);
}

/** Build complete Next.js Metadata (canonical, OG, Twitter card) without duplicating boilerplate. */
export function buildPageMetadata({
  title,
  description,
  canonical,
  type = "website",
  lang,
  languages,
  keywords,
  robots,
  maxTitleChars = 48,
}: {
  title: string;
  description: string;
  canonical: string;
  type?: "website" | "article";
  lang?: string;
  languages?: Record<string, string>;
  keywords?: string[];
  robots?: Metadata["robots"];
  maxTitleChars?: number;
}): Metadata {
  const safeTitle = truncateTitle(title, maxTitleChars);
  const safeDescription = truncateMetaDescription(description);
  const socialTitle = `${safeTitle} | LastBerth`;

  return {
    title: safeTitle,
    description: safeDescription,
    ...(keywords ? { keywords } : {}),
    ...(robots ? { robots } : {}),
    alternates: {
      canonical,
      ...(languages ? { languages } : {}),
    },
    openGraph: buildOpenGraph({
      title: socialTitle,
      description: safeDescription,
      url: canonical,
      type,
      lang,
    }),
    twitter: buildTwitterCard({
      title: socialTitle,
      description: safeDescription,
    }),
  };
}

/** Build schema.org FAQPage JSON-LD from question/answer pairs. */
export function buildFaqPageJsonLd(
  faqs: ReadonlyArray<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/** Build schema.org BreadcrumbList JSON-LD from (name, item) pairs. */
export function buildBreadcrumbJsonLd(
  items: ReadonlyArray<{ name: string; item: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}
