import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/site-url";

const baseUrl = getBaseUrl();

// Non-page areas kept out of every crawler: the private user dashboard, the
// admin console, the JSON API, and the auth screens (no SEO value).
// Intentionally NOT blocked: /_next/static (JS/CSS/fonts) and the favicon/icon
// routes. Googlebot needs the JS/CSS to render pages, and it needs the icons to
// show a favicon in search results — blocking them would hurt indexing, not help
// it. Those asset URLs are never indexed as pages; "Crawled - currently not
// indexed" is the normal, correct state for them.
const DISALLOW = ["/admin", "/dashboard", "/api", "/login", "/register"];

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
