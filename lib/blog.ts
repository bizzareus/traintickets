import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** ISO date `YYYY-MM-DD`. */
  updated: string | null;
  tags: string[];
  readingTimeMinutes: number;
  sources: string[];
};

export type BlogPost = BlogPostMeta & {
  content: string;
};

export type FaqEntry = {
  question: string;
  answer: string;
};

/**
 * Extracts FAQ question/answer pairs from blog markdown content.
 * Looks for H3 headings (### ) within an FAQ section (identified by an H2
 * containing "FAQ" or "Common Booking Questions"). Each H3 is treated as a
 * question, and all text until the next heading or section break is the answer.
 */
export function parseFaqFromMarkdown(markdown: string): FaqEntry[] {
  const lines = markdown.split("\n");
  const entries: FaqEntry[] = [];

  // Find the FAQ section start (H2 containing "FAQ" or "Common Booking Questions")
  let inFaqSection = false;
  let currentQuestion: string | null = null;
  let currentAnswerLines: string[] = [];

  const flushEntry = () => {
    if (currentQuestion && currentAnswerLines.length > 0) {
      const answer = currentAnswerLines
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (answer) {
        entries.push({ question: currentQuestion, answer });
      }
    }
    currentQuestion = null;
    currentAnswerLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect FAQ section start
    if (/^## /.test(trimmed) && /faq|common.*question/i.test(trimmed)) {
      inFaqSection = true;
      continue;
    }

    if (!inFaqSection) continue;

    // End of FAQ section (another H2 or horizontal rule followed by H2)
    if (/^## /.test(trimmed) && !/faq|common.*question/i.test(trimmed)) {
      flushEntry();
      break;
    }

    // H3 = new question
    if (/^### /.test(trimmed)) {
      flushEntry();
      currentQuestion = trimmed.replace(/^###\s+/, "").replace(/\?$/, "?");
      continue;
    }

    // Skip empty lines, horizontal rules, and markdown formatting within answer
    if (currentQuestion) {
      if (trimmed === "" || trimmed === "---") continue;
      // Strip markdown formatting for clean plain-text answer
      const cleanLine = trimmed
        .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
        .replace(/\*([^*]+)\*/g, "$1")       // italic
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // links
        .replace(/`([^`]+)`/g, "$1");        // inline code
      currentAnswerLines.push(cleanLine);
    }
  }
  flushEntry();

  return entries;
}


const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function ymdOrNull(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const t = String(item ?? "")
      .trim()
      .toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function estimateReadingTimeMinutes(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_[\](){}/\\|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 1;
  const words = text.split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function parseMetaFromMatter(
  slug: string,
  data: Record<string, unknown>,
  content: string,
): BlogPostMeta {
  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : slug;
  const description =
    typeof data.description === "string" && data.description.trim()
      ? data.description.trim()
      : "";
  const date = ymdOrNull(data.date) ?? "1970-01-01";
  const updated = ymdOrNull(data.updated);
  const tags = normalizeTags(data.tags);
  const sources = Array.isArray(data.sources) ? data.sources.map(String) : [];
  const readingTimeMinutes = estimateReadingTimeMinutes(content);
  return {
    slug,
    title,
    description,
    date,
    updated,
    tags,
    readingTimeMinutes,
    sources,
  };
}

function postPathForSlug(slug: string, lang?: string): string {
  if (lang && lang !== "en") {
    return path.join(BLOG_DIR, lang, `${slug}.md`);
  }
  return path.join(BLOG_DIR, `${slug}.md`);
}

export const listBlogPostSlugs = cache((lang?: string): string[] => {
  const dir = lang && lang !== "en" ? path.join(BLOG_DIR, lang) : BLOG_DIR;
  const files = safeReadDir(dir);
  const slugs = files
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((s) => s.length > 0);
  slugs.sort();
  return slugs;
});

export const listBlogPosts = cache((lang?: string): BlogPostMeta[] => {
  const metas: BlogPostMeta[] = [];
  for (const slug of listBlogPostSlugs(lang)) {
    const p = postPathForSlug(slug, lang);
    let raw = "";
    try {
      raw = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const { data, content } = matter(raw);
    metas.push(
      parseMetaFromMatter(slug, data as Record<string, unknown>, content),
    );
  }
  metas.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return metas;
});

export const getBlogPost = cache((slug: string, lang?: string): BlogPost | null => {
  const s = String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!s) return null;
  const p = postPathForSlug(s, lang);
  let raw = "";
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const meta = parseMetaFromMatter(s, data as Record<string, unknown>, content);
  return { ...meta, content };
});

export function hasBlogPostTranslation(slug: string, lang: string): boolean {
  if (!lang || lang === "en") return true;
  const s = String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!s) return false;
  const p = postPathForSlug(s, lang);
  return fs.existsSync(p);
}

export function getAvailableTranslations(slug: string): string[] {
  const allLangs = ["mr", "hi", "bn", "ta", "te", "ml"];
  const available = ["en"]; // English is always the fallback/default
  for (const lang of allLangs) {
    if (hasBlogPostTranslation(slug, lang)) {
      available.push(lang);
    }
  }
  return available;
}

export function mapStateToLanguage(stateCode: string): string | null {
  const code = stateCode.toUpperCase().trim();
  switch (code) {
    case "MH": return "mr"; // Marathi
    case "UP":
    case "BR":
    case "MP":
    case "DL":
    case "RJ":
    case "HR":
    case "UK":
    case "CG":
    case "JH":
    case "CH": return "hi"; // Hindi
    case "WB": return "bn"; // Bengali
    case "TN": return "ta"; // Tamil
    case "TG":
    case "AP": return "te"; // Telugu
    case "KL": return "ml"; // Malayalam
    default: return null;
  }
}

export function getLanguageName(langCode: string): string {
  switch (langCode) {
    case "mr": return "Marathi";
    case "hi": return "Hindi";
    case "bn": return "Bengali";
    case "ta": return "Tamil";
    case "te": return "Telugu";
    case "ml": return "Malayalam";
    default: return "English";
  }
}

