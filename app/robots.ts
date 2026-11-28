import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/site-url";

export const dynamic = "force-static";
const baseUrl = getBaseUrl();

// Non-page areas kept out of every crawler: the private user dashboard, the
// admin console, the JSON API, and the auth screens (no SEO value).
// Intentionally NOT blocked: /_next/static (JS/CSS/fonts) and the favicon/icon
// routes. Googlebot needs the JS/CSS to render pages, and it needs the icons to
// show a favicon in search results — blocking them would hurt indexing, not help
// it. Those asset URLs are never indexed as pages; "Crawled - currently not
// indexed" is the normal, correct state for them.
const DISALLOW = [
  "/admin",
  "/dashboard",
  "/api",
  "/login",
  "/register",
  "/unsubscribe",
  "/split-booking",
  "/chart-alert",
  "/alerts/subscribe",
  "/s/",
  "/v1",
  // Dynamic search results and internal query strings (Google/Bing crawl budget protection)
  "/*?*from=*",
  "/*?*to=*",
  "/*?*train=*",
  "/*?*fromName=*",
  "/*?*toName=*",
  "/*?*date=*",
  "/*?*search_term_string*",
  "/?*",
  "/hi?*",
  "/mr?*",
  "/bn?*",
  "/ta?*",
  "/te?*",
  "/ml?*",
];

// AI search / assistant crawlers we explicitly welcome (so content can surface in
// ChatGPT, Perplexity, Gemini/AI Overviews, Claude, etc.). All are allowed
// site-wide except the non-page areas above.
//  - GPTBot:              OpenAI training crawler
//  - OAI-SearchBot:       ChatGPT Search crawler (determines ChatGPT Search citability)
//  - ChatGPT-User:        on-demand fetch when a ChatGPT user opens a link
//  - ClaudeBot:           Anthropic training crawler
//  - Claude-SearchBot:    Claude search citability crawler
//  - Claude-User:         on-demand fetch when a Claude user opens a link
//  - PerplexityBot / Perplexity-User: Perplexity search & user fetchers
//  - Google-Extended / Google-CloudVertexBot: Gemini/Vertex grounding & training
//  - Applebot-Extended / Amazonbot / CCBot / cohere-ai / Bytespider
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Google-CloudVertexBot",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "cohere-ai",
  "Bytespider",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
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
