import type { Metadata } from "next";

export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "LastBerth – Find Confirmed Train Tickets",
} as const;

export const DEFAULT_TWITTER_IMAGE = "/twitter-image";

/** Build consistent OpenGraph metadata so subpages keep their own url and og:image. */
export function buildOpenGraph({
  title,
  description,
  url,
  type = "website",
}: {
  title: string;
  description: string;
  url: string;
  type?: "website" | "article";
}): NonNullable<Metadata["openGraph"]> {
  return {
    type,
    locale: "en_IN",
    siteName: "LastBerth",
    title,
    description,
    url,
    images: [{ ...DEFAULT_OG_IMAGE }],
  };
}

/** Cap a meta description at a clean word boundary within SEO display limits. */
export function truncateMetaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${(lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trimEnd()}…`;
}
