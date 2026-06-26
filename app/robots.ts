import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://lastberth.com");

const baseUrl =
  typeof siteUrl === "string" && siteUrl.startsWith("http")
    ? siteUrl
    : "https://lastberth.com";

// Non-page areas kept out of every crawler.
const DISALLOW = ["/admin", "/dashboard", "/api"];

// AI search / assistant crawlers we explicitly welcome (so content can surface in
// ChatGPT, Perplexity, Gemini/AI Overviews, etc.). All are allowed site-wide
// except the non-page areas above.
//  - GPTBot:        OpenAI training crawler
//  - OAI-SearchBot: ChatGPT Search crawler
//  - ChatGPT-User:  on-demand fetch when a ChatGPT user opens a link
//  - PerplexityBot / Perplexity-User: Perplexity
//  - Google-Extended: lets Google use content for Gemini/AI grounding
//  - Applebot-Extended / CCBot / Bytespider / Amazonbot / cohere-ai / Claude-related
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "cohere-ai",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
